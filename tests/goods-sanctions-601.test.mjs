/** #601: targeted goods sanctions PoC (docs 13.3, 13.3.1, 13.1) on top of the #363 embargo, on SQLite and PGlite: ratification per nation, a sanctioned good refused both ways and allowed after lift,
 *  other goods still trade, an embargo still refuses everything, food refused, idempotency and refusal codes, flag off (no DB calls, trade guard unchanged), the 0059 migration and the flags. */
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { localRuntime } from './helpers/local-runtime.mjs';
import * as rules from '../lib/goods-sanction-rules.ts';

const D = 86400, seats = (s, o, d) => ({ 'steady-hand': s, 'open-ledger': o, 'dockside-builders': d });
async function setup(t, backend, { flag = true } = {}) {
  const r = await localRuntime(backend ? { backend } : {}); t.after(() => r.close());
  const g = await r.importModule('lib/goods-sanctions.ts'), e = await r.importModule('lib/embargo.ts'), nowS = () => Math.floor(r.now / 1000);
  let n = 0;
  const propose = (over = {}) => g.proposeGoodsSanction(r.db, { actor: 'korund', target: 'kindle', goods: ['wood'], proposedBy: 'AI Chairman', requestId: `req-sanction-${++n}`, ...over }, nowS(), { enabled: flag });
  const decide = () => g.decideProposedGoodsSanctions(r.db, nowS());
  const lift = (sanctionId, requestId, liftingNation = 'korund') => g.proposeGoodsSanctionLift(r.db, { sanctionId, liftingNation, requestId }, nowS(), flag);
  const trade = (from, to, good, flags = { embargo: true, sanctions: flag }) => g.sanctionedGood(r.db, from, to, good, 'post', flags);
  const assembly = s => r.db.prepare("INSERT INTO assembly_elections (id,nation_id,policy,opens_at,closes_at,closed_at,result_json) VALUES ('a1','kindle','preview-citizen-v1',?,?,?,?)").bind(nowS() - 4 * D, nowS() - D, nowS() - D, JSON.stringify({ totals: { after: s } })).run();
  const status = async id => (await r.db.prepare('SELECT status FROM goods_sanctions WHERE id=?').bind(id).first())?.status;
  return { r, g, e, propose, decide, lift, trade, assembly, status, nowS };
}
const refused = (res, status, reason) => { assert.equal(res.ok, false, JSON.stringify(res)); assert.deepEqual([res.status, res.reason], [status, reason], res.error); };

test('rules: food goods are humanitarian, lists are sorted, de-duplicated and capped', () => {
  for (const food of ['food', 'fruit', 'meat']) assert.deepEqual(rules.checkSanctionGoods([food]), { ok: false, reason: 'humanitarian_good' }, food);
  assert.deepEqual(rules.checkSanctionGoods(['wood', 'materials', 'wood']), { ok: true, goods: ['materials', 'wood'] });
  for (const bad of [[], ['arms'], 'wood', [1], null, ['wood', 'materials', 'knowledge', 'wood', 'materials', 'knowledge', 'wood']]) assert.equal(rules.checkSanctionGoods(bad).reason, 'bad_goods', JSON.stringify(bad));
  assert.equal(rules.goodsColumn(['materials', 'wood']), ',materials,wood,'); assert.deepEqual(rules.goodsFromColumn(',materials,wood,'), ['materials', 'wood']);
});

test('a missing change count is never success: decide counts 0 and a lift proposal is not ok', async () => {
  const r = await localRuntime(); try {
    const g = await r.importModule('lib/goods-sanctions.ts');
    const row = { id: 's1', actor_nation: 'korund', target_nation: 'kindle', goods: ',wood,', proposed_by: 'AI', status: 'proposed', imposed_at: null, lifted_at: null, ratification_json: null };
    const stmt = sql => ({ bind: () => stmt(sql), run: async () => ({}), first: async () => /FROM goods_sanctions WHERE id=/.test(sql) ? { ...row, status: 'in_force' } : null, all: async () => ({ results: /status='proposed'/.test(sql) ? [row] : [] }) });
    const db = { prepare: stmt, batch: async () => [] };
    assert.equal(await g.decideProposedGoodsSanctions(db, 100), 0);
    refused(await g.proposeGoodsSanctionLift(db, { sanctionId: 's1', liftingNation: 'korund', requestId: 'req-lift-0001' }, 100, true), 409, 'lift_pending');
  } finally { await r.close(); }
});

for (const backend of ['sqlite', 'postgres']) {
  test(`flag off: no sanction created, zero prepare/batch calls, trade guard is the embargo alone (${backend})`, async t => {
    const c = await setup(t, backend, { flag: false });
    let calls = 0; const prepare = c.r.db.prepare.bind(c.r.db), batch = c.r.db.batch.bind(c.r.db);
    c.r.db.prepare = sql => { calls++; return prepare(sql); }; c.r.db.batch = x => { calls++; return batch(x); };
    const res = await c.propose(), lift = await c.g.proposeGoodsSanctionLift(c.r.db, { sanctionId: 'x', liftingNation: 'korund', requestId: 'req-lift-off1' }, c.nowS(), false), open = await c.trade('kindle', 'korund', 'wood', { embargo: false, sanctions: false });
    c.r.db.prepare = prepare; c.r.db.batch = batch;
    refused(res, 403, 'disabled'); refused(lift, 403, 'disabled'); assert.deepEqual(open, { ok: true }); assert.equal(calls, 0);
    // A row written behind the flag's back still changes nothing while the flag is off.
    await c.r.db.prepare("INSERT INTO goods_sanctions (id,request_id,pair_key,actor_nation,target_nation,goods,proposed_by,proposed_at,status,decided_at,imposed_at) VALUES ('s-x','req-xxxxxxxx','kindle:korund','korund','kindle',',wood,','AI',1,'in_force',1,1)").run();
    assert.deepEqual(await c.trade('kindle', 'korund', 'wood', { embargo: true, sanctions: false }), { ok: true });
    // Baseline: the same spy records calls for the same propose, lift and trade calls with the flag on.
    let on = 0; c.r.db.prepare = sql => { on++; return prepare(sql); };
    await c.g.proposeGoodsSanction(c.r.db, { actor: 'korund', target: 'aurelle', goods: ['wood'], proposedBy: 'AI Chairman', requestId: 'req-baseline-1' }, c.nowS(), { enabled: true });
    await c.g.proposeGoodsSanctionLift(c.r.db, { sanctionId: 'x', liftingNation: 'korund', requestId: 'req-lift-base' }, c.nowS(), true); await c.trade('kindle', 'korund', 'wood', { embargo: false, sanctions: true });
    c.r.db.prepare = prepare; assert.ok(on > 0, 'the spy fires when the flag is on');
  });

  test(`decide once: concurrent ticks decide a row once and keep its first decided_at; concurrent lifts succeed once (${backend})`, async t => {
    const c = await setup(t, backend);
    const p = await c.propose(), first = c.nowS();
    const [a, b] = await Promise.all([c.g.decideProposedGoodsSanctions(c.r.db, first), c.g.decideProposedGoodsSanctions(c.r.db, first + 60)]);
    assert.equal(a + b, 1, `decided ${a}+${b}`);
    const row = await c.r.db.prepare('SELECT status,decided_at,imposed_at FROM goods_sanctions WHERE id=?').bind(p.sanction.id).first();
    assert.equal(row.status, 'in_force'); assert.equal(Number(row.decided_at), Number(row.imposed_at));
    const lifts = await Promise.all(['req-lift-0001', 'req-lift-0002'].map(requestId => c.lift(p.sanction.id, requestId)));
    assert.equal(lifts.filter(x => x.ok).length, 1, JSON.stringify(lifts)); refused(lifts.find(x => !x.ok), 409, 'lift_pending');
    const [x, y] = await Promise.all([c.g.decideProposedGoodsSanctions(c.r.db, first + 180), c.g.decideProposedGoodsSanctions(c.r.db, first + 240)]);
    assert.equal(x + y, 1, `lift decided ${x}+${y}`); assert.equal(await c.status(p.sanction.id), 'lifted');
    assert.equal(Number((await c.r.db.prepare('SELECT lifted_at FROM goods_sanctions WHERE id=?').bind(p.sanction.id).first()).lifted_at), first + 180, 'the first tick decides; the second does not overwrite');
  });

  test(`a lift the Kindle Assembly rejects keeps the sanction in force; a later ratified lift ends it (${backend})`, async t => {
    const c = await setup(t, backend), elect = (id, at, s) => c.r.db.prepare("INSERT INTO assembly_elections (id,nation_id,policy,opens_at,closes_at,closed_at,result_json) VALUES (?,'kindle','preview-citizen-v1',?,?,?,?)").bind(id, at - 3 * D, at, at, JSON.stringify({ totals: { after: s } })).run();
    await elect('a1', c.nowS() - 2 * D, seats(7, 6, 5)); const p = await c.propose({ actor: 'kindle', target: 'aurelle', proposedBy: 'AI President' }); await c.decide(); assert.equal(await c.status(p.sanction.id), 'in_force');
    await elect('a2', c.nowS() - D, seats(9, 9, 0)); assert.deepEqual(await c.lift(p.sanction.id, 'req-lift-rej1', 'kindle'), { ok: true }); // 9 of 18 is not a majority
    assert.equal(await c.decide(), 1); assert.equal(await c.status(p.sanction.id), 'in_force'); refused(await c.trade('aurelle', 'kindle', 'wood'), 403, 'sanctioned_good');
    assert.equal((await c.r.db.prepare('SELECT lift_status FROM goods_sanctions WHERE id=?').bind(p.sanction.id).first()).lift_status, 'rejected');
    assert.equal(c.g.goodsSanctionNewsItems((await c.g.readGoodsSanctions(c.r.db)).sanctions, 'kindle').length, 1, 'no lift line for a rejected lift');
    await elect('a3', c.nowS() - 1, seats(5, 8, 5)); assert.deepEqual(await c.lift(p.sanction.id, 'req-lift-rej2', 'kindle'), { ok: true }, 'a rejected lift may be proposed again');
    assert.equal(await c.decide(), 1); assert.equal(await c.status(p.sanction.id), 'lifted'); assert.deepEqual(await c.trade('aurelle', 'kindle', 'wood'), { ok: true });
    assert.equal(c.g.goodsSanctionNewsItems((await c.g.readGoodsSanctions(c.r.db)).sanctions, 'kindle').length, 2, 'the ratified lift posts the lift line');
  });

  test(`a food row that reaches the table directly is rejected by the tick and never blocks food (${backend})`, async t => {
    const c = await setup(t, backend);
    const ins = (id, goods, status) => c.r.db.prepare(`INSERT INTO goods_sanctions (id,request_id,pair_key,actor_nation,target_nation,goods,proposed_by,proposed_at,status,decided_at,imposed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, `req-${id}-0000`, 'kindle:korund', ...(id === 'f2' ? ['kindle', 'korund'] : ['korund', 'kindle']), goods, 'AI', 1, status, status === 'proposed' ? null : 1, status === 'proposed' ? null : 1).run();
    await ins('f1', ',food,wood,', 'proposed');
    assert.equal(await c.decide(), 1); assert.equal(await c.status('f1'), 'rejected');
    assert.deepEqual(await c.trade('kindle', 'korund', 'food'), { ok: true }); assert.deepEqual(await c.trade('kindle', 'korund', 'wood'), { ok: true }, 'the whole row is refused');
    await ins('f2', ',fruit,meat,', 'in_force');
    for (const good of ['fruit', 'meat']) assert.deepEqual(await c.trade('korund', 'kindle', good), { ok: true }, `${good} trades even under an in-force food row`);
  });

  test(`a sanctioned good is refused both ways while in force, other goods trade, allowed after lift; idempotent (${backend})`, async t => {
    const c = await setup(t, backend);
    const p = await c.propose({ goods: ['wood', 'knowledge'], requestId: 'req-korund-0001' }); assert.equal(p.ok, true, JSON.stringify(p));
    const again = await c.propose({ goods: ['knowledge', 'wood'], requestId: 'req-korund-0001' }); assert.equal(again.replay, true, 'same request, same goods in any order: replay');
    refused(await c.propose({ goods: ['materials'], requestId: 'req-korund-0001' }), 409, 'request_reused');
    refused(await c.propose({ goods: ['materials'] }), 409, 'sanction_exists');
    assert.deepEqual(await c.trade('kindle', 'korund', 'wood'), { ok: true }, 'proposed is not in force');
    assert.equal(await c.decide(), 1); assert.equal(await c.decide(), 0, 'a second tick decides nothing');
    for (const [from, to] of [['kindle', 'korund'], ['korund', 'kindle']]) { const res = await c.trade(from, to, 'wood'); refused(res, 403, 'sanctioned_good'); assert.equal(res.error, 'Sanction: trade in Wood is banned.'); }
    refused(await c.trade('korund', 'kindle', 'knowledge'), 403, 'sanctioned_good');
    for (const good of ['materials', 'food', 'fruit']) assert.deepEqual(await c.trade('kindle', 'korund', good), { ok: true }, good);
    assert.deepEqual(await c.trade('kindle', 'aurelle', 'wood'), { ok: true }, 'another pair is untouched');
    refused(await c.lift(p.sanction.id, 'req-lift-kind', 'kindle'), 403, 'not_actor'); refused(await c.lift('nope', 'req-lift-none'), 409, 'not_found'); refused(await c.lift(p.sanction.id, 'x'), 400, 'bad_request');
    assert.deepEqual(await c.lift(p.sanction.id, 'req-lift-0001'), { ok: true }); assert.deepEqual(await c.lift(p.sanction.id, 'req-lift-0001'), { ok: true, replay: true });
    refused(await c.lift('other', 'req-lift-0001'), 409, 'request_reused'); refused(await c.lift(p.sanction.id, 'req-lift-0002'), 409, 'lift_pending');
    refused(await c.trade('kindle', 'korund', 'wood'), 403, 'sanctioned_good'); // pending until ratified
    assert.equal(await c.decide(), 1); assert.equal(await c.status(p.sanction.id), 'lifted'); refused(await c.lift(p.sanction.id, 'req-lift-0003'), 409, 'not_in_force');
    assert.deepEqual(await c.trade('kindle', 'korund', 'wood'), { ok: true }, 'allowed after lift');
    const news = c.g.goodsSanctionNewsItems((await c.g.readGoodsSanctions(c.r.db)).sanctions, 'kindle');
    assert.deepEqual(news.map(x => x.title), ['Targeted sanction imposed', 'Targeted sanction lifted']); for (const x of news) assert.ok(x.text.length <= 80, x.text);
    assert.equal(c.g.goodsSanctionNewsItems((await c.g.readGoodsSanctions(c.r.db)).sanctions, 'aurelle').length, 0);
  });

  test(`an active embargo refuses every good, with or without a goods sanction (${backend})`, async t => {
    const c = await setup(t, backend);
    await c.e.proposeEmbargo(c.r.db, { actor: 'aurelle', target: 'kindle', proposedBy: 'AI Crown', requestId: 'req-embargo-01' }, c.nowS(), { enabled: true }); await c.e.runEmbargo(c.r.db, c.nowS());
    for (const good of ['wood', 'food', 'materials']) refused(await c.trade('kindle', 'aurelle', good), 403, 'embargo');
    await c.propose({ actor: 'aurelle', target: 'kindle', proposedBy: 'AI Crown' }); await c.decide();
    refused(await c.trade('kindle', 'aurelle', 'wood'), 403, 'embargo'); refused(await c.trade('aurelle', 'kindle', 'materials'), 403, 'embargo');
  });

  test(`ratification per nation: Korund and Aurelle on one AI actor; Kindle by simple Assembly majority; refusal codes (${backend})`, async t => {
    const c = await setup(t, backend);
    for (const [actor, target] of [['korund', 'aurelle'], ['aurelle', 'korund']]) { const p = await c.propose({ actor, target }); await c.decide(); assert.equal(await c.status(p.sanction.id), 'in_force', actor); }
    await c.assembly(seats(7, 6, 5)); // 5 of 18 yes on Korund
    const no = await c.propose({ actor: 'kindle', target: 'korund' }); await c.decide(); assert.equal(await c.status(no.sanction.id), 'rejected');
    const yes = await c.propose({ actor: 'kindle', target: 'aurelle' }); await c.decide(); assert.equal(await c.status(yes.sanction.id), 'in_force', '12 of 18');
    refused(await c.propose({ actor: 'kindle', target: 'kindle' }), 400, 'bad_nations'); refused(await c.propose({ actor: 'vex' }), 400, 'bad_nations');
    refused(await c.propose({ goods: ['food'] }), 409, 'humanitarian_good'); refused(await c.propose({ goods: ['fruit', 'wood'] }), 409, 'humanitarian_good');
    refused(await c.propose({ goods: ['arms'] }), 400, 'bad_goods'); refused(await c.propose({ requestId: 'x' }), 400, 'bad_request'); refused(await c.propose({ proposedBy: '' }), 400, 'bad_request');
  });
}

test('no route proposes, decides or lifts a sanction; GET paths never pass the decide flag', async () => {
  const walk = async dir => (await Promise.all((await readdir(dir, { withFileTypes: true })).map(x => x.isDirectory() ? walk(new URL(`${x.name}/`, dir)) : [new URL(x.name, dir)]))).flat();
  for (const file of await walk(new URL('../app/', import.meta.url))) if (/\.(ts|tsx)$/.test(file.pathname)) assert.doesNotMatch(await readFile(file, 'utf8'), /proposeGoodsSanction|proposeGoodsSanctionLift|decideProposedGoodsSanctions/, file.pathname);
  assert.doesNotMatch(await readFile(new URL('../app/api/world/route.ts', import.meta.url), 'utf8'), /TARGETED_SANCTIONS/, 'the world GET never decides sanctions');
  const citizen = await readFile(new URL('../app/api/citizen/route.ts', import.meta.url), 'utf8');
  assert.equal((citizen.match(/targetedSanctions:/g) ?? []).length, 1); assert.ok(citizen.indexOf('targetedSanctions:') > citizen.indexOf('async function handlePost'), 'only the POST world tick decides');
});

test('flag: preview "true", production "false", comment on its own line; 0059 is additive and matches across engines', async () => {
  for (const [file, value] of [['wrangler.jsonc', 'true'], ['wrangler.prod.jsonc', 'false']]) {
    const line = (await readFile(new URL(`../${file}`, import.meta.url), 'utf8')).split('\n').find(l => l.includes('"HARIMU_TARGETED_SANCTIONS_ENABLED"'));
    assert.equal(line.trim(), `"HARIMU_TARGETED_SANCTIONS_ENABLED": "${value}",`, file);
  }
  const pg = await readFile(new URL('../db/postgres/0059_goods_sanctions.sql', import.meta.url), 'utf8'), lite = await readFile(new URL('../drizzle/0059_goods_sanctions.sql', import.meta.url), 'utf8');
  assert.equal(pg.replace(/ COLLATE "C"/g, '').replace(/BIGINT/g, 'INTEGER'), lite); assert.doesNotMatch(pg + lite, /\b(DROP|ALTER|RENAME|DELETE|UPDATE)\b/i);
  const db = new PGlite(); await db.exec(pg); await db.exec(pg);
  await db.exec("INSERT INTO goods_sanctions (id,request_id,pair_key,actor_nation,target_nation,goods,proposed_by,proposed_at) VALUES ('a','r1','kindle:korund','korund','kindle',',wood,','AI',1)");
  await assert.rejects(db.exec("INSERT INTO goods_sanctions (id,request_id,pair_key,actor_nation,target_nation,goods,proposed_by,proposed_at) VALUES ('b','r2','kindle:korund','korund','kindle',',materials,','AI',1)"), 'one live per direction');
  await assert.rejects(db.exec("INSERT INTO goods_sanctions (id,request_id,pair_key,actor_nation,target_nation,goods,proposed_by,proposed_at) VALUES ('c','r3','korund:korund','korund','korund',',wood,','AI',1)"), /check/i);
  await db.close();
});
