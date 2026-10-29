/** #1054: a treaty returns squares captured in that war unless a concession ceded them. Surrender and flag off leave owners as they are. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { FLAG_PACKS } from '../lib/flag-pack.mjs';
import { localRuntime } from './helpers/local-runtime.mjs';

const SECRET = 'a-very-long-server-only-secret';
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const read = file => readFileSync(file, 'utf8');

test('flag: packed, preview on, production off, and it needs HARIMU_WAR_ENABLED', () => {
  const preview = strip(read('wrangler.jsonc')), prod = strip(read('wrangler.prod.jsonc')), src = read('lib/war-peace-revert.ts');
  assert.match(src, /export const revertUncededCaptures = true/);
  assert.match(src, /\[ASSUMPTION\]/);
  assert.equal(preview.vars.HARIMU_ARMY_PACK.HARIMU_WAR_PEACE_REVERT_ENABLED, 'true');
  assert.equal(prod.vars.HARIMU_ARMY_PACK.HARIMU_WAR_PEACE_REVERT_ENABLED, 'false');
  assert.equal('HARIMU_WAR_PEACE_REVERT_ENABLED' in preview.vars, false);
  assert.ok(FLAG_PACKS.HARIMU_ARMY_PACK.includes('HARIMU_WAR_PEACE_REVERT_ENABLED'));
  for (const file of ['app/api/war/route.ts', 'app/api/news/route.ts', 'app/api/citizen/route.ts']) assert.match(read(file), /peaceRevertEnabled/);
  assert.match(read('lib/world-simulation.ts'), /peaceRevert: options\.peaceRevert === true/);
  assert.match(read('tests/helpers/local-runtime.mjs'), /lib\/war-peace-revert\.ts/);
  assert.equal(existsSync('db/postgres/0112_war_peace_reverts.sql'), true);
  assert.equal(existsSync('drizzle/0112_war_peace_reverts.sql'), true);
  assert.equal(existsSync('db/postgres/0111_war_peace_reverts.sql'), false, '0111 is #1056 and #1059');
});

async function setup(t) {
  const r = await localRuntime(); t.after(() => r.close());
  const nowS = () => Math.floor(r.now / 1000);
  r.setFixtureEnv('HARIMU_SHARD_STARTED_AT', String(nowS() - 60 * 86400));
  const actions = await r.importModule('lib/war-actions.ts'), endings = await r.importModule('lib/war-endings.ts'), peace = await r.importModule('lib/war-peace-revert.ts'), history = await r.importModule('lib/city-capture-history.ts'), news = await r.importModule('lib/national-news.ts');
  const command = (body, { peaceRevert = false, endings: on = false } = {}) => actions.handleWarCommand(r.db, { enabled: true, endings: on, peaceRevert, secret: SECRET, authorization: `Bearer ${SECRET}`, body: { requestId: randomUUID(), ...body }, now: nowS() });
  const owner = async s => (await r.db.prepare('SELECT owner FROM world_squares WHERE x=? AND y=?').bind(s.x, s.y).first()).owner;
  const run = (sql, ...bind) => r.db.prepare(sql).bind(...bind).run();
  const frontier = (await r.db.prepare("SELECT x,y FROM world_squares WHERE zone='frontier' ORDER BY x,y LIMIT 4").all()).results.map(s => ({ x: Number(s.x), y: Number(s.y) }));
  const heart = await r.db.prepare("SELECT x,y FROM world_squares WHERE zone='heartland' LIMIT 1").first();
  const squares = { siege: frontier[0], battle: frontier[1], ceded: frontier[2], other: frontier[3], heart: { x: Number(heart.x), y: Number(heart.y) } };
  return { r, command, endings, peace, history, news, owner, run, squares, nowS };
}

async function seize(c, { warId, id, square, from, to, at, city = 'forgehaven', heart = null }) {
  const siege = `siege-${id}`;
  await c.run('INSERT INTO city_sieges (id,war_id,city_key,city_kind,center_x,center_y,attacker_nation,defender_nation,created_at,captured_at) VALUES (?,?,?,?,?,?,?,?,?,?)', siege, warId, `city:${city}`, 'founded', square.x, square.y, to, from, at, at);
  await c.run('INSERT INTO city_captures (id,siege_id,war_id,request_id,attacker_nation,defender_nation,squares_transferred,squares_kept_private,captured_at) VALUES (?,?,?,?,?,?,?,?,?)', id, siege, warId, `rq-${id}`, to, from, heart ? 2 : 1, 0, at);
  await c.run('INSERT INTO city_capture_squares (capture_id,x,y,from_nation,to_nation) VALUES (?,?,?,?,?)', id, square.x, square.y, from, to);
  await c.run('UPDATE world_squares SET owner=? WHERE x=? AND y=?', to, square.x, square.y);
  if (heart) {
    await c.run('INSERT INTO city_capture_squares (capture_id,x,y,from_nation,to_nation) VALUES (?,?,?,?,?)', id, heart.x, heart.y, from, to);
    await c.run('UPDATE world_squares SET owner=? WHERE x=? AND y=?', to, heart.x, heart.y);
  }
}

test('treaty: siege and battle captures revert, heartland and title stay, capture history and one news line remain', async t => {
  const c = await setup(t), at = c.nowS();
  const prod = strip(read('wrangler.prod.jsonc'));
  assert.equal(c.peace.peaceRevertEnabled({ HARIMU_WAR_ENABLED: 'true', HARIMU_WAR_PEACE_REVERT_ENABLED: 'true' }), true);
  assert.equal(c.peace.peaceRevertEnabled({ HARIMU_WAR_ENABLED: 'false', HARIMU_WAR_PEACE_REVERT_ENABLED: 'true' }), false, 'flag off without war');
  assert.equal(c.peace.peaceRevertEnabled({ HARIMU_WAR_ENABLED: 'true', HARIMU_ARMY_PACK: prod.vars.HARIMU_ARMY_PACK }), false, 'flag off');
  assert.equal(c.peace.peaceRevertEnabled({ HARIMU_WAR_ENABLED: 'true', HARIMU_ARMY_PACK: '{"HARIMU_WAR_PEACE_REVERT_ENABLED":"true"}', HARIMU_WAR_PEACE_REVERT_ENABLED: 'false' }), false, 'a direct string wins');
  assert.equal(c.peace.revertUncededCaptures, true);
  const declared = await c.command({ action: 'declare', nation: 'korund', role: 'Chairman', defender: 'kindle' });
  assert.equal(declared.ok, true, JSON.stringify(declared));
  const warId = declared.war.id;
  await seize(c, { warId, id: 'cap-1054', square: c.squares.siege, from: 'kindle', to: 'korund', at, heart: c.squares.heart });
  await c.run('INSERT INTO war_frontier_transfers (id,war_id,battle_key,request_id,x,y,from_nation,to_nation,transferred_at) VALUES (?,?,?,?,?,?,?,?,?)', 'wft-1054', warId, 'b1', 'req-battle-1054', c.squares.battle.x, c.squares.battle.y, 'korund', 'kindle', at);
  await c.run('UPDATE world_squares SET owner=? WHERE x=? AND y=?', 'kindle', c.squares.battle.x, c.squares.battle.y);
  await c.run("INSERT INTO world_square_purchases (request_id,clerk_user_id,nation_id,x,y,price_minor,purchased_at) VALUES ('buy-1054','alice','korund',?,?,2500,1)", c.squares.siege.x, c.squares.siege.y);
  await c.run('INSERT INTO relocation_support_pots (capture_id,protocol_minor,treasury_topup_minor,eligible_count,per_citizen_minor,created_at) VALUES (?,?,?,?,?,?)', 'cap-1054', 100, 0, 1, 100, at);
  await c.run('INSERT INTO relocation_support_claims (capture_id,clerk_user_id,request_id,amount_minor,claimed_at) VALUES (?,?,?,?,?)', 'cap-1054', 'alice', 'rel-1054', 100, at);
  const titles = async () => (await c.r.db.prepare('SELECT request_id,x,y,nation_id,price_minor FROM world_square_purchases ORDER BY request_id').all()).results;
  const relief = async () => (await c.r.db.prepare('SELECT capture_id,amount_minor FROM relocation_support_claims').all()).results;
  const beforeTitles = await titles(), beforeRelief = await relief();
  await c.command({ action: 'propose-end', nation: 'korund', role: 'Chairman', warId, kind: 'peace' });
  const acceptId = randomUUID();
  const ended = await c.command({ action: 'accept-end', nation: 'kindle', role: 'President', warId, requestId: acceptId }, { peaceRevert: true });
  assert.equal(ended.ok, true, JSON.stringify(ended));
  assert.equal(ended.war.endKind, 'treaty');
  assert.equal(await c.owner(c.squares.siege), 'kindle', 'the siege capture returns');
  assert.equal(await c.owner(c.squares.battle), 'korund', 'the battle capture returns');
  assert.equal(await c.owner(c.squares.heart), 'korund', 'heartland stays');
  assert.deepEqual(await titles(), beforeTitles, 'purchases are not touched');
  assert.deepEqual(await relief(), beforeRelief, 'relocation is not touched');
  const panel = await c.history.latestCityCapture(c.r.db, 'kindle', 'forgehaven');
  assert.deepEqual(panel, { heldBy: 'Korund', capturedFrom: 'Kindle', capturedAt: at }, 'capture history still shows the capture');
  const line = await c.peace.peaceRevertNewsItems(c.r.db, 'kindle');
  assert.equal(line.length, 1);
  assert.equal(line[0].text, c.peace.peaceRevertLine(2));
  const edition = await c.news.readNationalNews(c.r.db, 'kindle', c.r.now, { peaceRevert: true });
  assert.ok(edition.items.some(item => item.id === line[0].id && item.text === line[0].text), 'the feed carries the one line');
  assert.equal((await c.news.readNationalNews(c.r.db, 'kindle', c.r.now, {})).items.some(item => String(item.id).endsWith(':peace-revert')), false, 'flag off: the feed does not read it');
  const replay = await c.command({ action: 'accept-end', nation: 'kindle', role: 'President', warId, requestId: acceptId }, { peaceRevert: true });
  assert.equal(replay.replay, true);
  assert.equal(await c.owner(c.squares.siege), 'kindle');
  const prepare = c.r.db.prepare.bind(c.r.db), seen = [];
  c.r.db.prepare = sql => { seen.push(sql); return prepare(sql); };
  const again = await c.peace.revertPeaceCaptures(c.r.db, warId, at);
  assert.deepEqual(again, { squares: 2, replay: true });
  assert.equal(seen.some(sql => /UPDATE world_squares/i.test(sql)), false, 're-running the ending writes no square');
  assert.equal(Number((await prepare('SELECT COUNT(*) AS n FROM war_peace_reverts').first()).n), 1);
});

test('concession: a ceded square stays and an unceded capture reverts; surrender changes nothing', async t => {
  const c = await setup(t), at = c.nowS();
  const declared = await c.command({ action: 'declare', nation: 'korund', role: 'Chairman', defender: 'kindle' });
  const warId = declared.war.id;
  await seize(c, { warId, id: 'cap-revert', square: c.squares.other, from: 'korund', to: 'kindle', at, city: 'kolt-savanna' });
  await seize(c, { warId, id: 'cap-cede', square: c.squares.ceded, from: 'aurelle', to: 'kindle', at, city: 'lumen-harbor' });
  const proposed = await c.command({ action: 'concede', nation: 'kindle', role: 'President', warId, squares: [c.squares.ceded] }, { endings: true });
  assert.equal(proposed.status, 'proposed', JSON.stringify(proposed));
  assert.equal(await c.endings.decideWarEndings(c.r.db, at + 60, { peaceRevert: true }), 1);
  assert.equal(await c.owner(c.squares.ceded), 'korund', 'the ceded square stays with the recipient');
  assert.notEqual(await c.owner(c.squares.ceded), 'aurelle');
  assert.equal(await c.owner(c.squares.other), 'korund', 'the unceded capture returns');
  assert.equal((await c.peace.peaceRevertNewsItems(c.r.db, 'korund'))[0].text, c.peace.peaceRevertLine(1));
  const s = await setup(t), when = s.nowS();
  const war = (await s.command({ action: 'declare', nation: 'korund', role: 'Chairman', defender: 'kindle' })).war;
  await seize(s, { warId: war.id, id: 'cap-surrender', square: s.squares.siege, from: 'kindle', to: 'korund', at: when });
  assert.equal((await s.command({ action: 'surrender', nation: 'kindle', role: 'President', warId: war.id }, { endings: true })).status, 'proposed');
  assert.equal(await s.endings.decideWarEndings(s.r.db, when + 60, { peaceRevert: true }), 1);
  assert.equal(await s.owner(s.squares.siege), 'korund', 'surrender leaves the capture');
  assert.equal((await s.r.db.prepare('SELECT end_kind FROM wars WHERE id=?').bind(war.id).first()).end_kind, 'treaty');
  assert.equal(await s.r.db.prepare('SELECT 1 AS n FROM war_peace_reverts WHERE war_id=?').bind(war.id).first(), null);
  assert.equal(await s.endings.decideWarEndings(s.r.db, when + 120, { peaceRevert: true }), 0);
  assert.equal(await s.owner(s.squares.siege), 'korund', 'a later tick still does not return a surrendered square');
});

test('a treaty that ended before the return still gives the squares back on the next tick', async t => {
  const c = await setup(t), at = c.nowS();
  const war = (await c.command({ action: 'declare', nation: 'korund', role: 'Chairman', defender: 'kindle' })).war;
  await seize(c, { warId: war.id, id: 'cap-crash', square: c.squares.siege, from: 'kindle', to: 'korund', at });
  const wars = await c.r.importModule('lib/war.ts');
  assert.equal((await wars.endWar(c.r.db, war.id, 'treaty', at, true, false)).ok, true);
  // The ending batch committed the pending marker and the process died before the square moves. That is the only row the next tick will finish.
  await c.run("INSERT INTO war_peace_reverts (war_id,status,squares,reverted_at) VALUES (?,'pending',NULL,?)", war.id, at);
  assert.equal(await c.owner(c.squares.siege), 'korund', 'the end committed and the return did not');
  assert.equal(await c.endings.decideWarEndings(c.r.db, at + 60, { peaceRevert: true }), 0);
  assert.equal(await c.owner(c.squares.siege), 'kindle', 'the next tick returns it');
  assert.equal(await c.endings.decideWarEndings(c.r.db, at + 120, { peaceRevert: true }), 0);
  assert.equal(await c.owner(c.squares.siege), 'kindle');
  assert.equal((await c.r.db.prepare('SELECT status FROM war_peace_reverts WHERE war_id=?').bind(war.id).first()).status, 'done');
  const d = await setup(t), when = d.nowS();
  const war2 = (await d.command({ action: 'declare', nation: 'korund', role: 'Chairman', defender: 'kindle' })).war;
  await seize(d, { warId: war2.id, id: 'cap-crash-2', square: d.squares.other, from: 'korund', to: 'kindle', at: when, city: 'kolt-savanna' });
  await seize(d, { warId: war2.id, id: 'cap-crash-cede', square: d.squares.ceded, from: 'aurelle', to: 'kindle', at: when, city: 'lumen-harbor' });
  assert.equal((await d.command({ action: 'concede', nation: 'kindle', role: 'President', warId: war2.id, squares: [d.squares.ceded] }, { endings: true })).status, 'proposed');
  assert.equal(await d.endings.decideWarEndings(d.r.db, when + 60), 1);
  await d.run("INSERT INTO war_peace_reverts (war_id,status,squares,reverted_at) VALUES (?,'pending',NULL,?)", war2.id, when + 60);
  assert.equal(await d.owner(d.squares.other), 'kindle', 'the concession ended and the unceded capture stayed');
  assert.equal(await d.owner(d.squares.ceded), 'korund');
  assert.equal(await d.endings.decideWarEndings(d.r.db, when + 120, { peaceRevert: true }), 0);
  assert.equal(await d.owner(d.squares.other), 'korund', 'the next tick returns the unceded capture');
  assert.equal(await d.owner(d.squares.ceded), 'korund', 'the ceded square stays');
});

test('a treaty ended while the flag was off stays untouched after the flag turns on', async t => {
  const c = await setup(t), at = c.nowS();
  const war = (await c.command({ action: 'declare', nation: 'korund', role: 'Chairman', defender: 'kindle' })).war;
  await seize(c, { warId: war.id, id: 'cap-old', square: c.squares.siege, from: 'kindle', to: 'korund', at });
  const wars = await c.r.importModule('lib/war.ts');
  assert.equal((await wars.endWar(c.r.db, war.id, 'treaty', at, true, false)).ok, true);
  assert.equal(await c.r.db.prepare('SELECT 1 AS n FROM war_peace_reverts WHERE war_id=?').bind(war.id).first(), null);
  assert.equal(await c.endings.decideWarEndings(c.r.db, at + 60, { peaceRevert: true }), 0);
  assert.equal(await c.owner(c.squares.siege), 'korund', 'no marker, so the sweep does not take the square back');
  assert.equal(await c.r.db.prepare('SELECT 1 AS n FROM war_peace_reverts').first(), null);
});

test('flag off: a treaty and a concession leave captured squares where they are', async t => {
  const c = await setup(t), at = c.nowS();
  const war = (await c.command({ action: 'declare', nation: 'korund', role: 'Chairman', defender: 'kindle' })).war;
  await seize(c, { warId: war.id, id: 'cap-off', square: c.squares.siege, from: 'kindle', to: 'korund', at });
  const prepare = c.r.db.prepare.bind(c.r.db), seen = [];
  c.r.db.prepare = sql => { seen.push(sql); return prepare(sql); };
  await c.command({ action: 'propose-end', nation: 'korund', role: 'Chairman', warId: war.id, kind: 'peace' });
  const ended = await c.command({ action: 'accept-end', nation: 'kindle', role: 'President', warId: war.id });
  assert.equal(ended.war.endKind, 'treaty');
  assert.equal(await c.owner(c.squares.siege), 'korund', 'flag off: the capture stays');
  assert.equal(seen.some(sql => /war_peace_reverts/.test(sql)), false, 'flag off does not read or write the revert table');
  c.r.db.prepare = prepare;
  const d = await setup(t), when = d.nowS();
  const war2 = (await d.command({ action: 'declare', nation: 'korund', role: 'Chairman', defender: 'kindle' })).war;
  await seize(d, { warId: war2.id, id: 'cap-off-2', square: d.squares.other, from: 'korund', to: 'kindle', at: when, city: 'kolt-savanna' });
  await d.run('UPDATE world_squares SET owner=? WHERE x=? AND y=?', 'kindle', d.squares.ceded.x, d.squares.ceded.y);
  assert.equal((await d.command({ action: 'concede', nation: 'kindle', role: 'President', warId: war2.id, squares: [d.squares.ceded] }, { endings: true })).status, 'proposed');
  assert.equal(await d.endings.decideWarEndings(d.r.db, when + 60), 1);
  assert.equal(await d.owner(d.squares.ceded), 'korund', 'the concession itself still moves');
  assert.equal(await d.owner(d.squares.other), 'kindle', 'flag off: the other capture is not returned');
  assert.equal(await d.r.db.prepare('SELECT 1 AS n FROM war_peace_reverts').first(), null);
});
