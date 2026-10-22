/** #427 slice 2: war endings (HARIMU_WAR_ENDINGS_ENABLED). ARC: surrender needs a majority of the surrendering nation's own assembly; a concession needs both sides' ratification,
 *  the same as treaties, and moves only national control of Frontier squares the ceding nation governs (never Heartland, never a privately bought square, never title rows).
 *  Decided once on the next tick after diplomacy with a strict rowcount; GETs read-only; flag off changes nothing. No reparations, no DMZ. SQLite and PGlite. Fixed clocks only. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

const D = 86400, SECRET = 'a-very-long-server-only-secret';
const write = /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i;
const incumbents = { 'steady-hand': 7, 'open-ledger': 6, 'dockside-builders': 5 };

async function setup(t, backend) {
  const r = await localRuntime(backend ? { backend } : {}); t.after(() => r.close());
  const nowS = () => Math.floor(r.now / 1000);
  r.setFixtureEnv('HARIMU_SHARD_STARTED_AT', String(nowS() - 60 * D));
  const e = await r.importModule('lib/war-endings.ts'), actions = await r.importModule('lib/war-actions.ts'), sim = await r.importModule('lib/world-simulation.ts');
  const command = (body, { endings = true } = {}) => actions.handleWarCommand(r.db, { enabled: true, endings, secret: SECRET, authorization: `Bearer ${SECRET}`, body: { requestId: randomUUID(), ...body }, now: nowS() });
  const war = (await command({ action: 'declare', nation: 'korund', role: 'Chairman', defender: 'kindle' })).war;
  const frontier = (await r.db.prepare("SELECT x,y FROM world_squares WHERE zone='frontier' ORDER BY x,y LIMIT 4").all()).results.map(s => ({ x: Number(s.x), y: Number(s.y) }));
  const own = (nation, squares = frontier) => Promise.all(squares.map(s => r.db.prepare('UPDATE world_squares SET owner=? WHERE x=? AND y=?').bind(nation, s.x, s.y).run()));
  const owner = async s => (await r.db.prepare('SELECT owner FROM world_squares WHERE x=? AND y=?').bind(s.x, s.y).first()).owner;
  const terms = async id => ({ ...(await r.db.prepare('SELECT status,reject_reason,ratification_json FROM war_end_terms WHERE id=?').bind(id).first()) });
  const ended = async () => (await r.db.prepare('SELECT ended_at,end_kind FROM wars WHERE id=?').bind(war.id).first());
  const decide = (at = nowS() + 60) => e.decideWarEndings(r.db, at);
  const spy = async fn => { const prepare = r.db.prepare.bind(r.db), batch = r.db.batch.bind(r.db), seen = { sqls: [], writes: [] };
    r.db.prepare = sql => { seen.sqls.push(sql); if (write.test(sql)) seen.writes.push(sql.slice(0, 60)); return prepare(sql); };
    r.db.batch = s => { seen.writes.push('batch'); return batch(s); };
    try { seen.result = await fn(); } finally { r.db.prepare = prepare; r.db.batch = batch; } return seen; };
  return { r, e, sim, command, war, frontier, own, owner, terms, ended, decide, spy, nowS };
}

test('rules: surrender is a majority of the surrendering nation alone; a concession needs both sides, Kindle at two-thirds; the whole Assembly is the denominator', async t => {
  const { e } = await setup(t);
  assert.deepEqual(e.kindleEndingVote('surrender', incumbents), { nation: 'kindle', body: 'Assembly', rule: 'simple-majority', yes: 13, total: 18, passed: true });
  assert.equal(e.kindleEndingVote('surrender', { 'steady-hand': 6, 'open-ledger': 3, 'dockside-builders': 9 }).passed, false, '9 of 18 is a tie');
  assert.equal(e.kindleEndingVote('surrender', { ...incumbents, independents: 8 }).passed, false, '13 of 26: an unknown party counts against');
  assert.equal(e.kindleEndingVote('cede', { 'steady-hand': 6, 'open-ledger': 6, 'dockside-builders': 6 }).passed, true, '12 of 18 is two-thirds');
  assert.equal(e.kindleEndingVote('cede', { 'steady-hand': 6, 'open-ledger': 5, 'dockside-builders': 7 }).passed, false, '11 of 18 is short of two-thirds');
  assert.deepEqual(e.decideEnding('surrender', 'korund', 'kindle', {}).ratifications.map(r => r.body), ['Chairman'], "Korund's own body only, never Kindle's Assembly");
  assert.deepEqual(e.decideEnding('concession', 'aurelle', 'kindle', { 'steady-hand': 0, 'open-ledger': 0, 'dockside-builders': 9 }).ratifications.map(r => [r.body, r.passed]), [['Crown', true], ['Assembly', true]]);
  assert.equal(e.decideEnding('concession', 'kindle', 'korund', { 'steady-hand': 6, 'open-ledger': 5, 'dockside-builders': 7 }).passed, false, 'the ceding Assembly must ratify too');
  assert.equal(e.decideEnding('surrender', 'kindle', 'korund', {}).passed, false, 'no seats: no majority');
  assert.doesNotMatch(readFileSync('lib/war-endings.ts', 'utf8'), /reparations_|treasury|ledger_entries|_minor|dmz_/i, 'no reparations path, no money moves, no DMZ');
});

for (const backend of [undefined, 'postgres']) {
  const label = backend ? ' (PGlite)' : '';
  test(`surrender: proposed, then the next tick ends the war as a treaty once; Kindle surrenders by its own Assembly${label}`, async t => {
    const c = await setup(t, backend);
    const rid = randomUUID(), s = await c.command({ action: 'surrender', nation: 'kindle', role: 'President', warId: c.war.id, requestId: rid });
    assert.equal(s.status, 'proposed'); assert.equal((await c.ended()).ended_at, null, 'nothing ends before the tick');
    assert.equal((await c.command({ action: 'surrender', nation: 'kindle', role: 'President', warId: c.war.id, requestId: rid })).replay, true);
    assert.equal((await c.command({ action: 'surrender', nation: 'korund', role: 'Chairman', warId: c.war.id })).reason, 'ending_pending', 'one pending ending per war');
    assert.equal((await c.command({ action: 'surrender', nation: 'aurelle', role: 'Monarch', warId: c.war.id })).reason, 'not_a_party');
    assert.equal(await c.decide(), 1); assert.equal(await c.decide(), 0, 'decided once');
    const row = await c.terms(s.terms.id); assert.equal(row.status, 'enacted'); assert.deepEqual(JSON.parse(row.ratification_json).map(r => [r.body, r.yes, r.total]), [['Assembly', 13, 18]]);
    assert.deepEqual([Number((await c.ended()).ended_at), (await c.ended()).end_kind], [c.nowS() + 60, 'treaty'], 'the peace lock starts');
  });

  test(`concession: both sides ratify; only Frontier squares the ceding nation governs move; Heartland, foreign and privately bought squares are refused; title rows untouched${label}`, async t => {
    const c = await setup(t, backend); const [a, b, bought, foreign] = c.frontier;
    await c.own('korund', [a, b, bought]); await c.own('aurelle', [foreign]);
    await c.r.db.prepare("INSERT INTO world_square_purchases (request_id,clerk_user_id,nation_id,x,y,price_minor,purchased_at) VALUES ('sq-427',?,'korund',?,?,2500,1)").bind('alice', bought.x, bought.y).run();
    const heart = await c.r.db.prepare("SELECT x,y FROM world_squares WHERE zone='heartland' AND owner='korund' LIMIT 1").first();
    const concede = squares => c.command({ action: 'concede', nation: 'korund', role: 'Chairman', warId: c.war.id, squares });
    for (const sq of [[{ x: Number(heart.x), y: Number(heart.y) }], [bought], [foreign], [a, { x: -99, y: -99 }]]) assert.equal((await concede(sq)).reason, 'square_not_cedable', JSON.stringify(sq));
    for (const sq of [[], [a, a], Array.from({ length: 11 }, (_, i) => ({ x: i, y: 0 })), 'x']) assert.equal((await concede(sq)).reason, 'bad_squares');
    const titles = async () => (await c.r.db.prepare('SELECT request_id,clerk_user_id,nation_id,x,y FROM world_square_purchases ORDER BY request_id').all()).results.map(x => ({ ...x }));
    const before = await titles(), ok = await concede([a, b]); assert.equal(ok.status, 'proposed');
    assert.equal(await c.decide(), 1);
    assert.deepEqual([await c.owner(a), await c.owner(b), await c.owner(bought)], ['kindle', 'kindle', 'korund']);
    assert.deepEqual(JSON.parse((await c.terms(ok.terms.id)).ratification_json).map(r => r.body), ['Chairman', 'Assembly']);
    assert.deepEqual(await titles(), before, 'private title rows are never touched'); assert.equal((await c.ended()).end_kind, 'treaty');
  });

  test(`decision-time re-checks: a square no longer governed, or a war already ended, rejects the ending and moves nothing${label}`, async t => {
    const c = await setup(t, backend); const [a, b] = c.frontier; await c.own('korund', [a, b]);
    const p = await c.command({ action: 'concede', nation: 'korund', role: 'Chairman', warId: c.war.id, squares: [a, b] });
    await c.r.db.prepare('UPDATE world_squares SET owner=? WHERE x=? AND y=?').bind('aurelle', b.x, b.y).run();
    await c.decide(); assert.deepEqual([(await c.terms(p.terms.id)).reject_reason, await c.owner(a), (await c.ended()).ended_at], ['square_not_cedable', 'korund', null]);
    const s = await c.command({ action: 'surrender', nation: 'korund', role: 'Chairman', warId: c.war.id });
    await c.r.db.prepare('UPDATE wars SET ended_at=?,end_kind=? WHERE id=?').bind(c.nowS(), 'other', c.war.id).run();
    await c.decide(); assert.equal((await c.terms(s.terms.id)).reject_reason, 'war_ended'); assert.equal((await c.ended()).end_kind, 'other', 'the earlier end is kept');
  });

  test(`a stale eligibility read never moves a square someone else now governs: the move itself is guarded by owner, zone and no purchase${label}`, async t => {
    const c = await setup(t, backend); const [a] = c.frontier; await c.own('korund', [a]);
    await c.command({ action: 'concede', nation: 'korund', role: 'Chairman', warId: c.war.id, squares: [a] });
    await c.r.db.prepare('UPDATE world_squares SET owner=? WHERE x=? AND y=?').bind('aurelle', a.x, a.y).run();
    const prepare = c.r.db.prepare.bind(c.r.db), original = c.r.db.prepare; c.r.db.prepare = sql => { const s = prepare(sql); if (!/^SELECT zone,owner/.test(sql)) return s; const stale = { bind: () => stale, first: async () => ({ zone: 'frontier', owner: 'korund', bought: 0 }) }; return stale; };
    try { await c.decide(); } finally { c.r.db.prepare = original; }
    assert.equal(await c.owner(a), 'aurelle', 'the guarded UPDATE moved nothing');
  });

  test(`QA3: a change between the read and the batch (square re-owned, or war ended) leaves no partial cession, no war end and no enacted record${label}`, async t => {
    const c = await setup(t, backend);
    // Runs `change` just before the decision batch, after every read and JS re-check has already passed.
    const racing = async change => { const batch = c.r.db.batch.bind(c.r.db), original = c.r.db.batch; c.r.db.batch = async s => { c.r.db.batch = original; await change(); return batch(s); }; try { return await c.decide(); } finally { c.r.db.batch = original; } };
    const endWar = () => c.r.db.prepare('UPDATE wars SET ended_at=?,end_kind=? WHERE id=?').bind(c.nowS(), 'other', c.war.id).run();
    const [a, b] = c.frontier; await c.own('korund', [a, b]);
    const cede = await c.command({ action: 'concede', nation: 'korund', role: 'Chairman', warId: c.war.id, squares: [a, b] });
    assert.equal(await racing(() => c.r.db.prepare('UPDATE world_squares SET owner=? WHERE x=? AND y=?').bind('aurelle', b.x, b.y).run()), 1);
    assert.deepEqual([(await c.terms(cede.terms.id)).status, (await c.terms(cede.terms.id)).reject_reason, await c.owner(a), await c.owner(b), (await c.ended()).ended_at], ['rejected', 'square_not_cedable', 'korund', 'aurelle', null], 'concession: no partial cession, no war end');
    await c.r.db.prepare('UPDATE world_squares SET owner=? WHERE x=? AND y=?').bind('korund', b.x, b.y).run();
    const cede2 = await c.command({ action: 'concede', nation: 'korund', role: 'Chairman', warId: c.war.id, squares: [a, b] });
    await racing(endWar);
    assert.deepEqual([(await c.terms(cede2.terms.id)).reject_reason, await c.owner(a), await c.owner(b), (await c.ended()).end_kind], ['war_ended', 'korund', 'korund', 'other'], 'concession: war ended mid-decision');
    const c2 = await setup(t, backend);
    const s2 = await c2.command({ action: 'surrender', nation: 'korund', role: 'Chairman', warId: c2.war.id });
    const batch = c2.r.db.batch.bind(c2.r.db), original = c2.r.db.batch; c2.r.db.batch = async s => { c2.r.db.batch = original; await c2.r.db.prepare('UPDATE wars SET ended_at=?,end_kind=? WHERE id=?').bind(c2.nowS(), 'other', c2.war.id).run(); return batch(s); };
    try { await c2.decide(); } finally { c2.r.db.batch = original; }
    assert.deepEqual([(await c2.terms(s2.terms.id)).status, (await c2.terms(s2.terms.id)).reject_reason, (await c2.ended()).end_kind], ['rejected', 'war_ended', 'other'], 'surrender: no enacted record, the earlier end kept');
  });

  test(`QA3: a square bought, or moved off Frontier, or the war row deleted mid-decision: rejected, nothing moved, the war still open where it exists${label}`, async t => {
    const c = await setup(t, backend); const [a, b] = c.frontier; await c.own('korund', [a, b]);
    const racing = async change => { const batch = c.r.db.batch.bind(c.r.db), original = c.r.db.batch; c.r.db.batch = async s => { c.r.db.batch = original; await change(); return batch(s); }; try { return await c.decide(); } finally { c.r.db.batch = original; } };
    const concede = () => c.command({ action: 'concede', nation: 'korund', role: 'Chairman', warId: c.war.id, squares: [a, b] });
    for (const [why, change, undo] of [
      ['privately bought', () => c.r.db.prepare("INSERT INTO world_square_purchases (request_id,clerk_user_id,nation_id,x,y,price_minor,purchased_at) VALUES ('sq-race',?,'korund',?,?,2500,1)").bind('alice', b.x, b.y).run(), () => c.r.db.prepare("DELETE FROM world_square_purchases WHERE request_id='sq-race'").run()],
      ['moved off Frontier', () => c.r.db.prepare("UPDATE world_squares SET zone='wildlands' WHERE x=? AND y=?").bind(b.x, b.y).run(), () => c.r.db.prepare("UPDATE world_squares SET zone='frontier' WHERE x=? AND y=?").bind(b.x, b.y).run()],
    ]) {
      const p = await concede(); assert.equal(await racing(change), 1, why);
      assert.deepEqual([(await c.terms(p.terms.id)).status, (await c.terms(p.terms.id)).reject_reason, await c.owner(a), await c.owner(b), (await c.ended()).ended_at], ['rejected', 'square_not_cedable', 'korund', 'korund', null], why);
      await undo();
    }
    const p = await concede();
    await racing(async () => { await c.r.db.prepare('DELETE FROM war_end_terms WHERE war_id=? AND id<>?').bind(c.war.id, p.terms.id).run(); await c.r.db.prepare('DELETE FROM wars WHERE id=?').bind(c.war.id).run(); });
    const left = await c.r.db.prepare('SELECT status,reject_reason FROM war_end_terms WHERE id=?').bind(p.terms.id).first();
    // The terms row cascades away with its war where foreign keys are enforced; where it survives it must be rejected as war_ended. Never enacted, nothing moved.
    if (left) assert.deepEqual([left.status, left.reject_reason], ['rejected', 'war_ended']);
    assert.deepEqual([await c.owner(a), await c.owner(b)], ['korund', 'korund'], 'war deleted: nothing moved');
  });

  test(`a stale pending-row replay after the decision changes nothing: the enacting UPDATE is guarded by status${label}`, async t => {
    const c = await setup(t, backend);
    const s1 = await c.command({ action: 'surrender', nation: 'korund', role: 'Chairman', warId: c.war.id });
    const pending = (await c.r.db.prepare("SELECT * FROM war_end_terms WHERE status='proposed'").all()).results.map(x => ({ ...x }));
    assert.equal(await c.decide(), 1);
    await c.r.db.prepare('UPDATE wars SET ended_at=NULL,end_kind=NULL WHERE id=?').bind(c.war.id).run(); // an open war again, so only the status guard can stop a re-enactment
    const prepare = c.r.db.prepare.bind(c.r.db), original = c.r.db.prepare;
    c.r.db.prepare = sql => { if (!/FROM war_end_terms WHERE status='proposed'/.test(sql)) return prepare(sql); const st = { bind: () => st, all: async () => ({ results: pending }) }; return st; };
    try { assert.equal(await c.decide(c.nowS() + 999), 0, 'no second decision'); } finally { c.r.db.prepare = original; }
    assert.equal(Number((await c.r.db.prepare('SELECT decided_at FROM war_end_terms WHERE id=?').bind(s1.terms.id).first()).decided_at), c.nowS() + 60); assert.equal((await c.ended()).ended_at, null, 'the replay ended nothing');
  });

  test(`decided once under concurrent ticks (enact and reject paths): counts (1,0), squares move once; a missing rowcount is never a decision${label}`, async t => {
    const c = await setup(t, backend); const [a] = c.frontier; await c.own('korund', [a]);
    const p = await c.command({ action: 'concede', nation: 'korund', role: 'Chairman', warId: c.war.id, squares: [a] });
    assert.deepEqual((await Promise.all([c.decide(), c.decide()])).sort(), [0, 1]); assert.equal(await c.owner(a), 'kindle'); assert.equal((await c.terms(p.terms.id)).status, 'enacted');
    const c2 = await setup(t, backend);
    const lose = await c2.command({ action: 'surrender', nation: 'kindle', role: 'President', warId: c2.war.id });
    await c2.r.db.prepare('UPDATE wars SET ended_at=?,end_kind=? WHERE id=?').bind(c2.nowS(), 'other', c2.war.id).run();
    assert.deepEqual((await Promise.all([c2.decide(), c2.decide()])).sort(), [0, 1], 'reject path'); assert.equal((await c2.terms(lose.terms.id)).reject_reason, 'war_ended');
    const row = { id: 'w', request_id: 'r', war_id: 'x', kind: 'surrender', proposer_nation: 'korund', other_nation: 'kindle', squares_json: null, proposed_at: 1, status: 'proposed', decided_at: null, ratification_json: null, reject_reason: null };
    const stmt = sql => { const s = { bind: () => s, first: async () => /FROM wars/.test(sql) ? { ended_at: null } : null, all: async () => ({ results: /war_end_terms/.test(sql) ? [row] : [] }), run: async () => ({ meta: {} }) }; return s; };
    assert.equal(await c.e.decideWarEndings({ prepare: stmt, batch: async s => s.map(() => ({ meta: {} })) }, 1), 0);
  });

  test(`runs after diplomacy in the tick, and with a slow diplomacy runner still decides; flag off: no war_end_terms statements, no snapshot key, actions refused as unknown; GET never writes${label}`, async t => {
    const c = await setup(t, backend);
    const off = await c.spy(async () => [await c.command({ action: 'surrender', nation: 'korund', role: 'Chairman', warId: c.war.id }, { endings: false }),
      await c.sim.runWorldChains(c.sim.worldRunnerChains(c.r.db, c.nowS(), { war: true, warEndings: false })), await c.sim.readWorldSimulation(c.r.db, c.nowS(), { war: true, warEndings: false })]);
    assert.equal(off.result[0].reason, 'bad_request'); assert.deepEqual(off.sqls.filter(s => /war_end_terms/.test(s)), []); assert.equal('warEndings' in off.result[2], false);
    const on = await c.spy(async () => { await c.command({ action: 'surrender', nation: 'korund', role: 'Chairman', warId: c.war.id });
      const prepare = c.r.db.prepare; c.r.db.prepare = sql => { const s = prepare(sql); if (!new Error().stack.includes('/lib/diplomacy.')) return s; const w = Object.create(s); w.bind = (...v) => { const b = s.bind(...v); const x = Object.create(b); for (const m of ['run', 'first', 'all']) x[m] = async (...q) => { await new Promise(r => setTimeout(r, 30)); return b[m](...q); }; return x; }; for (const m of ['run', 'first', 'all']) w[m] = async (...q) => { await new Promise(r => setTimeout(r, 30)); return s[m](...q); }; return w; };
      try { await c.sim.runWorldChains(c.sim.worldRunnerChains(c.r.db, c.nowS() + 60, { diplomacy: true, war: true, warEndings: true })); } finally { c.r.db.prepare = prepare; } });
    assert.ok(on.sqls.filter(s => /war_end_terms/.test(s)).length > 0, 'baseline: the spy fires with the flag on'); assert.equal((await c.ended()).end_kind, 'treaty');
    const chain = c.sim.worldRunnerChains(c.r.db, 0, { diplomacy: true, war: true, warAssembly: true, warEndings: true }).find(ch => ch.some(x => x.name === 'diplomacy')).map(x => x.name);
    assert.ok(chain.indexOf('warEndings') > chain.indexOf('diplomacy') && chain.indexOf('warEndings') > chain.indexOf('warAssembly'), chain.join(' > '));
    const get = await c.spy(() => c.sim.readWorldSimulation(c.r.db, c.nowS(), { war: true, warEndings: true }));
    assert.deepEqual(get.writes, []); assert.equal(get.result.warEndings[0].status, 'enacted');
  });
}

test('flag, migration 0065, route and wiring', () => {
  const flag = f => [...readFileSync(f, 'utf8').matchAll(/^\s*\/\/ #427 slice 2[^\n]*\n\s*"HARIMU_WAR_ENDINGS_ENABLED"\s*:\s*"([^"]*)"/gm)].map(m => m[1]);
  assert.deepEqual(flag('wrangler.jsonc'), ['true']); assert.deepEqual(flag('wrangler.prod.jsonc'), ['false']);
  for (const f of ['drizzle/0065_war_end_terms.sql', 'db/postgres/0065_war_end_terms.sql']) {
    const sql = readFileSync(f, 'utf8').replace(/^--[^\n]*\n/gm, '');
    assert.deepEqual(sql.match(/^\s*[A-Z]+ [A-Z]+/gm).map(s => s.trim()), ['CREATE TABLE', 'CREATE UNIQUE'], `${f} is additive only`);
    assert.doesNotMatch(sql, /reparation|dmz/i);
  }
  assert.match(readFileSync('app/api/war/route.ts', 'utf8'), /endings: bindings\.HARIMU_WAR_ENDINGS_ENABLED === 'true'/);
  assert.match(readFileSync('lib/world-simulation.ts', 'utf8'), /name: 'warEndings', on: options\.war === true && options\.warEndings === true/);
});
