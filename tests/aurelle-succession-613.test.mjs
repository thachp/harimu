/** #613 slice 1: Aurelle hereditary succession PoC. Flag HARIMU_AURELLE_SUCCESSION_ENABLED (off), separate admin secret (fail closed), derived state, seniority and Great Council fallbacks,
 *  refusals during a coup/Rising Crisis Window or a war, one gazette item per transition (idempotent on retry), coup/Rising reset. SQLite and PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';

const read = rel => readFile(new URL(`../${rel}`, import.meta.url), 'utf8');
const SECRET = 'succession-test-secret-0123456789';
async function scene(t, backend, { on = true, secret = SECRET } = {}) {
  const r = await localRuntime(backend ? { backend } : {}); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_AURELLE_SUCCESSION_ENABLED', on ? 'true' : undefined); // the fixture env is shared across scenes: always set or clear
  r.setFixtureEnv('HARIMU_AURELLE_SUCCESSION_ADMIN_SECRET', secret || undefined);
  const mod = await r.importModule('lib/aurelle-succession.ts');
  let n = 0;
  const send = (action, requestId = `req-613-${++n}-${action}`, auth = `Bearer ${SECRET}`, extra = {}) => r.call('aurelle-succession', null, { action, requestId, ...extra }, undefined, '', auth ? { Authorization: auth } : {});
  const events = async () => (await r.db.prepare('SELECT seq,kind,member_id,name,house FROM aurelle_succession_events ORDER BY seq').all()).results.map(x => ({ ...x, seq: Number(x.seq) }));
  const gazette = async () => (await r.db.prepare("SELECT headline,detail FROM world_events WHERE kind='court-gazette' AND location='Aurelle' ORDER BY id").all()).results.map(x => ({ ...x }));
  const state = async () => { const s = await mod.readSuccession(r.db); return { status: s.status, ruler: s.ruler.name, heir: s.heir?.name ?? null }; };
  const run = (sql, ...b) => r.db.prepare(sql).bind(...b).run();
  const cycle = async () => { for (const a of ['illness', 'vacate', 'accede']) { const res = await send(a); assert.equal(res.status, 200, JSON.stringify(res.data)); } };
  return { r, mod, send, events, gazette, state, run, cycle };
}
const refused = (res, status, reason) => { assert.deepEqual([res.status, res.data.reason], [status, reason], JSON.stringify(res.data)); };

test('wrangler: the flag ships "false" in both configs with its comment on its own line, no line has a trailing //, and no secret value is in the repo', async () => {
  for (const file of ['wrangler.jsonc', 'wrangler.prod.jsonc']) {
    const cfg = await read(file);
    assert.deepEqual([...cfg.matchAll(/"HARIMU_AURELLE_SUCCESSION_ENABLED"\s*:\s*"([^"]*)"/g)].map(m => m[1]), ['false'], file);
    assert.match(cfg, /^\s*\/\/ #613:.*\n\s*"HARIMU_AURELLE_SUCCESSION_ENABLED": "false",$/m, `${file}: the comment is a full line above the flag`);
    assert.deepEqual(cfg.split('\n').filter(l => !/^\s*\/\//.test(l)).filter(l => /\/\/|\/\*/.test(l.replace(/"(?:[^"\\]|\\.)*"/g, '""'))), [], file);
    assert.doesNotMatch(cfg, /"HARIMU_AURELLE_SUCCESSION_ADMIN_SECRET"/, `${file}: the secret is set in the dashboard, never in the config`);
  }
});

test('rules: names fit 24 characters, houses match the coup/Rising modules, the base ruler matches the persona, and the lib stays import-free', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const rules = await r.importModule('lib/aurelle-succession-rules.ts'), coup = await r.importModule('lib/aurelle-coup-rules.ts'), rising = await r.importModule('lib/aurelle-rising-rules.ts'), personas = await r.importModule('lib/leader-personas.ts');
  assert.deepEqual(rules.baseRuler, { name: personas.leaderPersonas.aurelle.name, house: personas.leaderPersonas.aurelle.affiliation });
  assert.deepEqual(Object.keys(rules.houseLines).sort(), [rules.baseRuler.house, ...rising.claimants.map(c => c.house), ...coup.greatLords.map(l => l.house)].sort());
  assert.deepEqual(rules.councilHouses, coup.greatLords.map(l => ({ name: l.name, house: l.house })));
  for (const line of Object.values(rules.houseLines)) { assert.ok(line.members.length >= 2); for (const m of line.members) assert.ok(m.name.length >= 1 && m.name.length <= 24, m.name); if (line.named) assert.ok(line.members.some(m => m.id === line.named)); }
  for (const name of [...rules.councilHouses.map(h => h.name), ...rules.councilHouses.map(h => h.house)]) assert.ok(name.length <= 24, name);
  assert.deepEqual([...(await read('lib/aurelle-succession-rules.ts')).matchAll(/^import /gm)], [], 'import-free');
  const H = 'House Solenne', ev = (seq, kind, memberId, name, house) => ({ seq, kind, memberId, name, house, occurredAt: seq });
  assert.deepEqual(rules.nextHeir(H, new Set()), { memberId: 'elowen', name: 'Princess Elowen Solenne', house: H, named: true }, 'the named heir, not the most senior');
  assert.deepEqual(rules.nextHeir(H, new Set(['elowen'])), { memberId: 'aldric', name: 'Prince Aldric Solenne', house: H, named: false }, 'seniority fallback');
  assert.equal(rules.nextHeir(H, new Set(['elowen', 'aldric', 'tamsin'])), null); assert.equal(rules.nextHeir('House Nowhere', new Set()), null);
  const s = rules.deriveSuccession(rules.baseRuler, [ev(1, 'illness'), ev(2, 'vacancy'), ev(3, 'accession', 'elowen', 'Princess Elowen Solenne', H)]);
  assert.deepEqual([s.status, s.ruler.name, s.heir.memberId, s.events], ['acceded', 'Princess Elowen Solenne', 'aldric', 3]);
  assert.equal(rules.councilChoice(['House Solenne']).house, 'House Ashgrove'); assert.equal(rules.councilChoice(rules.councilHouses.map(h => h.house)), null);
  const ok = (a, from) => rules.actionAllowed(a, from);
  assert.deepEqual([ok('illness', 'reigning'), ok('illness', 'ailing'), ok('vacate', 'ailing'), ok('vacate', 'reigning'), ok('abdicate', 'ailing'), ok('abdicate', 'vacant'), ok('accede', 'vacant'), ok('accede', 'abdicated'), ok('accede', 'reigning')], [true, false, true, false, true, false, true, true, false]);
});

test('flag off: the trigger is a 404 before anything is read, and nothing is written', async t => {
  const c = await scene(t, undefined, { on: false });
  refused(await c.send('illness'), 404, 'disabled'); refused(await c.send('illness', 'x', null), 404, 'disabled'); refused(await c.send('nonsense', 'x'), 404, 'disabled');
  assert.deepEqual(await c.events(), []); assert.deepEqual(await c.gazette(), []);
  assert.deepEqual(await c.state(), { status: 'reigning', ruler: 'Maera Solenne', heir: 'Princess Elowen Solenne' });
});

test('flag off: the route makes zero database calls (no prepare, no batch), even with a valid credential and body', async t => {
  const c = await scene(t, undefined, { on: false });
  let calls = 0; const prepare = c.r.db.prepare.bind(c.r.db), batch = c.r.db.batch.bind(c.r.db);
  c.r.db.prepare = sql => { calls++; return prepare(sql); }; c.r.db.batch = x => { calls++; return batch(x); };
  const res = await c.send('illness', 'req-flag-off-0001'); c.r.db.prepare = prepare; c.r.db.batch = batch;
  refused(res, 404, 'disabled'); assert.equal(calls, 0, 'nothing is read or written before the flag check');
  const on = await scene(t); let onCalls = 0; const p2 = on.r.db.prepare.bind(on.r.db);
  on.r.db.prepare = sql => { onCalls++; return p2(sql); }; await on.send('illness', 'req-flag-on-00001'); on.r.db.prepare = p2;
  assert.ok(onCalls > 0, 'the spy sees database calls when the flag is on');
});

test('secret boundary: a 15-character secret never authorizes (401), a 16-character secret does (200)', async t => {
  const fifteen = 'a'.repeat(15), sixteen = 'b'.repeat(16);
  const short = await scene(t, undefined, { secret: fifteen }); refused(await short.send('illness', undefined, `Bearer ${fifteen}`), 401, 'unauthorized'); assert.deepEqual(await short.events(), []);
  const ok = await scene(t, undefined, { secret: sixteen }); const res = await ok.send('illness', undefined, `Bearer ${sixteen}`);
  assert.equal(res.status, 200, JSON.stringify(res.data)); assert.equal((await ok.events()).length, 1);
  refused(await ok.send('vacate', undefined, `Bearer ${'b'.repeat(15)}`), 401, 'unauthorized');
});

test('credential before body: unset, short or wrong secret is 401 (fail closed); a bad body is 400', async t => {
  const none = await scene(t, undefined, { secret: null }); refused(await none.send('illness'), 401, 'unauthorized');
  const short = await scene(t, undefined, { secret: 'short' }); refused(await short.send('illness', undefined, 'Bearer short'), 401, 'unauthorized');
  const c = await scene(t);
  refused(await c.send('illness', undefined, null), 401, 'unauthorized'); refused(await c.send('illness', undefined, 'Bearer wrong-secret-0123456789abcdef'), 401, 'unauthorized'); refused(await c.send('nonsense', undefined, 'Bearer nope'), 401, 'unauthorized');
  refused(await c.send('nonsense'), 400, 'bad_request'); refused(await c.send('illness', 'short'), 400, 'bad_request'); refused(await c.send('illness', undefined, undefined, { extra: 1 }), 400, 'bad_request');
  assert.deepEqual(await c.events(), []);
});

for (const backend of ['sqlite', 'postgres']) {
  test(`illness, vacancy, accession installs the named heir; retries replay; one gazette item per transition (${backend})`, async t => {
    const c = await scene(t, backend);
    const a = await c.send('illness', 'req-illness-1'); assert.equal(a.status, 200); assert.equal(a.data.state.status, 'ailing'); assert.equal(a.data.event.kind, 'illness');
    const again = await c.send('illness', 'req-illness-1'); assert.equal(again.status, 200); assert.equal(again.data.replay, true);
    assert.equal((await c.events()).length, 1); assert.equal((await c.gazette()).length, 1, 'a retry writes no second gazette item');
    refused(await c.send('accede'), 409, 'wrong_state'); refused(await c.send('illness'), 409, 'wrong_state');
    refused(await c.send('vacate', 'req-illness-1'), 409, 'request_reused');
    assert.equal((await c.send('vacate')).data.state.status, 'vacant');
    const acc = await c.send('accede', 'req-accede-1'); assert.equal(acc.status, 200);
    assert.deepEqual([acc.data.state.status, acc.data.state.ruler, acc.data.event.kind, acc.data.event.name], ['acceded', { name: 'Princess Elowen Solenne', house: 'House Solenne' }, 'accession', 'Princess Elowen Solenne']);
    assert.equal((await c.send('accede', 'req-accede-1')).data.replay, true);
    const g = await c.gazette(); assert.equal(g.length, 3); assert.equal(new Set(g.map(x => x.headline)).size, 3);
    assert.ok(g[2].headline.includes('Princess Elowen Solenne') && g[2].detail.includes('House Solenne'));
    assert.deepEqual((await c.events()).map(e => e.kind), ['illness', 'vacancy', 'accession']);
  });

  test(`no named heir left: seniority, then the Great Council, then the new house's own line; abdication works (${backend})`, async t => {
    const c = await scene(t, backend);
    await c.cycle(); assert.equal((await c.state()).ruler, 'Princess Elowen Solenne');
    await c.cycle(); assert.equal((await c.state()).ruler, 'Prince Aldric Solenne', 'seniority');
    assert.equal((await c.send('abdicate')).data.state.status, 'abdicated');
    assert.equal((await c.send('accede')).data.state.ruler.name, 'Lord Tamsin Solenne', 'abdication then the last member');
    assert.equal((await c.state()).heir, null);
    await c.cycle(); // the House is empty: the Great Council elects the first council house
    const s = await c.state(); assert.deepEqual([s.status, s.ruler, s.heir], ['acceded', 'Lord Maren Ashgrove', 'Lady Tess Ashgrove']);
    assert.equal((await c.events()).at(-1).kind, 'great_council');
    await c.cycle(); assert.equal((await c.state()).ruler, 'Lady Tess Ashgrove');
    const g = await c.gazette(); assert.equal(g.length, (await c.events()).length, 'exactly one gazette item per event');
  });

  test(`refused while a palace coup or Rising Crisis Window is open, or Aurelle is at war; a stored request still replays (${backend})`, async t => {
    const c = await scene(t, backend), now = Math.floor(Date.now() / 1000);
    assert.equal((await c.send('illness', 'req-before-1')).status, 200);
    await c.run("INSERT INTO aurelle_coups (id,formed_at,ruler_id,ruler_name,house,window_opened_at,window_closes_at) VALUES ('coup-1',?,'ashgrove','Lord Maren Ashgrove','House Ashgrove',?,?)", now - 100, now - 50, now + 3600);
    refused(await c.send('vacate'), 409, 'crisis_window_open'); assert.equal((await c.send('illness', 'req-before-1')).data.replay, true);
    await c.run("UPDATE aurelle_coups SET resolved_at=?, outcome='failed'", now); assert.equal((await c.send('vacate', 'req-after-coup')).status, 200);
    await c.run("INSERT INTO aurelle_coups (id,formed_at,ruler_id,ruler_name,house) VALUES ('coup-2',?,'dunmere','Lord Edric Dunmere','House Dunmere')", now); // forming in secret: not a Crisis Window
    assert.equal((await c.send('accede', 'req-secret-plot')).status, 200);
    await c.run("INSERT INTO aurelle_risings (id,claimant_id,opened_at,closes_at,pledges_at_open,weekly_humans_at_open,unrest_at_open) VALUES ('rise-1','vaelcourt',?,?,5,20,70)", now - 10, now + 3600);
    refused(await c.send('illness'), 409, 'crisis_window_open');
    await c.run("UPDATE aurelle_risings SET resolved_at=?, outcome='failed', pledges_at_close=1, weekly_humans_at_close=20, stability_at_close=80", now);
    await c.run("INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,declared_by,declared_at,mobilization_ends_at) VALUES ('w-other','rq-other','kindle:korund','kindle','korund','test',?,?)", now - 100, now - 100 + 172800);
    assert.equal((await c.send('illness', 'req-other-war')).status, 200, 'a war between other nations does not block');
    await c.run("INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,declared_by,declared_at,mobilization_ends_at) VALUES ('w-aur','rq-aur','aurelle:kindle','kindle','aurelle','test',?,?)", now - 10, now - 10 + 172800);
    refused(await c.send('vacate'), 409, 'at_war'); // mobilizing counts
    await c.run("UPDATE wars SET ended_at=?, end_kind='other' WHERE id='w-aur'", now);
    assert.equal((await c.send('vacate', 'req-peace')).status, 200);
  });

  test(`a successful palace coup or Rising resets the heir line to the new house (${backend})`, async t => {
    const c = await scene(t, backend);
    await c.cycle(); assert.equal((await c.state()).heir, 'Prince Aldric Solenne');
    const at = Number((await c.events()).length && (await c.r.db.prepare('SELECT MAX(occurred_at) AS t FROM aurelle_succession_events').first()).t);
    await c.run("INSERT INTO aurelle_coups (id,formed_at,ruler_id,ruler_name,house,window_opened_at,window_closes_at,resolved_at,outcome) VALUES ('coup-w',?,'ashgrove','Lord Maren Ashgrove','House Ashgrove',?,?,?,'succeeded')", at, at, at + 100, at + 200);
    assert.deepEqual(await c.state(), { status: 'reigning', ruler: 'Lord Maren Ashgrove', heir: 'Lady Tess Ashgrove' });
    await c.run("INSERT INTO aurelle_risings (id,claimant_id,opened_at,closes_at,pledges_at_open,weekly_humans_at_open,unrest_at_open,resolved_at,outcome,pledges_at_close,weekly_humans_at_close,stability_at_close) VALUES ('rise-w','larkspire',?,?,5,20,70,?,'succeeded',5,20,30)", at, at + 100, at + 300);
    const crowned = await c.mod.readSuccession(c.r.db);
    assert.deepEqual([crowned.status, crowned.ruler.house, crowned.heir.name], ['reigning', 'House Larkspire', 'Lady Wren Larkspire']);
    // time moves on: a new succession on the new house's line uses that line
    c.r.setNow((at + 1000) * 1000);
    for (const a of ['illness', 'vacate', 'accede']) assert.equal((await c.send(a)).status, 200, a);
    assert.equal((await c.state()).ruler, 'Lady Wren Larkspire');
  });

  test(`two simultaneous commands record one event and one gazette item; the loser is told to retry (${backend})`, async t => {
    const c = await scene(t, backend);
    const [x, y] = await Promise.all([c.send('illness', 'req-race-aaaa'), c.send('illness', 'req-race-bbbb')]);
    assert.deepEqual([x.status, y.status].sort(), [200, 409], JSON.stringify([x.data, y.data]));
    assert.match([x, y].find(r => r.status === 409).data.reason, /^(state_changed|wrong_state)$/);
    assert.equal((await c.events()).length, 1); assert.equal((await c.gazette()).length, 1);
    const [p, q] = await Promise.all([c.send('vacate', 'req-race-same1'), c.send('vacate', 'req-race-same1')]);
    assert.deepEqual([p.status, q.status], [200, 200]); assert.equal((await c.events()).length, 2); assert.equal((await c.gazette()).length, 2);
  });

  test(`a command that loses the seq race to another writer records nothing and writes no gazette item (${backend})`, async t => {
    const c = await scene(t, backend), batch = c.r.db.batch.bind(c.r.db);
    c.r.db.batch = async statements => { await c.r.db.prepare("INSERT INTO aurelle_succession_events (id,seq,request_id,kind,occurred_at) VALUES ('succ-other',1,'req-other-0000','vacancy',1)").run(); return batch(statements); };
    refused(await c.send('illness'), 409, 'state_changed'); c.r.db.batch = batch;
    assert.deepEqual((await c.events()).map(e => e.kind), ['vacancy']); assert.deepEqual(await c.gazette(), []);
  });

  test(`reading the succession writes nothing, and a database without migration 0055 reads as reigning (${backend})`, async t => {
    const c = await scene(t, backend);
    await c.cycle();
    const writes = [], prepare = c.r.db.prepare.bind(c.r.db), batch = c.r.db.batch.bind(c.r.db);
    c.r.db.prepare = sql => { if (/^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i.test(sql)) writes.push(sql.slice(0, 40)); return prepare(sql); }; c.r.db.batch = x => { writes.push('batch'); return batch(x); };
    await c.mod.readSuccession(c.r.db); await c.r.call('citizen', 'alice'); c.r.db.prepare = prepare; c.r.db.batch = batch;
    assert.deepEqual(writes, []);
    if (backend === 'sqlite') { await c.run('DROP TABLE aurelle_succession_events'); assert.deepEqual(await c.state(), { status: 'reigning', ruler: 'Maera Solenne', heir: 'Princess Elowen Solenne' }); }
  });
}

test('migration 0055 is additive in both dialects and matches the inline schema', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const [sqlite, pg, mod] = [await read('drizzle/0055_aurelle_succession_events.sql'), await read('db/postgres/0055_aurelle_succession_events.sql'), await r.importModule('lib/aurelle-succession.ts')];
  for (const sql of [sqlite, pg]) {
    assert.doesNotMatch(sql.replace(/^--.*$/gm, ''), /\b(DROP|ALTER|DELETE|UPDATE|INSERT)\b/i);
    assert.deepEqual([...sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(m => m[1]), ['aurelle_succession_events']);
  }
  assert.deepEqual([...mod.aurelleSuccessionSchemas.join(';').matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(m => m[1]), ['aurelle_succession_events']);
  const kinds = sql => [...sql.matchAll(/kind(?: TEXT)?(?: COLLATE "C")?(?: NOT NULL)? CHECK\(kind IN \(([^)]*)\)\)/g)].map(m => m[1].replace(/'/g, '').split(',').sort().join());
  assert.deepEqual([kinds(sqlite).length, kinds(pg).length, kinds(mod.aurelleSuccessionSchema).length], [1, 1, 1]);
  assert.deepEqual(kinds(pg), kinds(sqlite)); assert.deepEqual(kinds(mod.aurelleSuccessionSchema), kinds(sqlite));
  const rules = await r.importModule('lib/aurelle-succession-rules.ts');
  assert.deepEqual(kinds(sqlite)[0].split(','), Object.keys(rules.successionGazette).sort(), 'the CHECK list is exactly the event kinds that have a gazette line');
  for (const col of ['id', 'seq', 'request_id', 'kind', 'member_id', 'name', 'house', 'occurred_at']) { assert.match(sqlite, new RegExp(`\\b${col} `)); assert.match(pg, new RegExp(`\\b${col} `)); }
  const route = await read('app/api/aurelle-succession/route.ts');
  assert.ok(route.indexOf("HARIMU_AURELLE_SUCCESSION_ENABLED !== 'true'") < route.indexOf('bearerMatches(') && route.indexOf('bearerMatches(') < route.indexOf('readCommandObject('), 'flag, then credential, then body');
  assert.doesNotMatch(route, /export async function GET/);
});
