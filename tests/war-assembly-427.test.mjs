/** #427 slice 1: the Kindle Assembly war vote (HARIMU_WAR_ASSEMBLY_ENABLED). ARC: more than half of ALL seats, no quorum, a tie fails, decided once on the next tick
 *  with a strict rowcount, Founding/pact/peace lock re-checked at decision time, weariness display only, GETs read-only. SQLite and PGlite. Fixed clocks only. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

const D = 86400, SECRET = 'a-very-long-server-only-secret';
const write = /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i;

async function setup(t, backend) {
  const r = await localRuntime(backend ? { backend } : {}); t.after(() => r.close());
  const nowS = () => Math.floor(r.now / 1000);
  r.setFixtureEnv('HARIMU_SHARD_STARTED_AT', String(nowS() - 60 * D));
  const a = await r.importModule('lib/war-assembly.ts'), actions = await r.importModule('lib/war-actions.ts'), sim = await r.importModule('lib/world-simulation.ts');
  const declare = (body = {}, { assembly = true, now = nowS() } = {}) => actions.handleWarCommand(r.db, { enabled: true, assembly, secret: SECRET, authorization: `Bearer ${SECRET}`, body: { requestId: randomUUID(), action: 'declare', nation: 'kindle', role: 'President', defender: 'korund', ...body }, now });
  const wars = async () => (await r.db.prepare('SELECT id,attacker_nation,defender_nation FROM wars ORDER BY id').all()).results.map(x => ({ ...x }));
  const proposal = async id => ({ ...(await r.db.prepare('SELECT status,war_id,reject_reason,vote_json,decided_at FROM war_proposals WHERE id=?').bind(id).first()) });
  const spy = async fn => { const prepare = r.db.prepare.bind(r.db), batch = r.db.batch.bind(r.db), seen = { sqls: [], writes: [] };
    r.db.prepare = sql => { seen.sqls.push(sql); if (write.test(sql)) seen.writes.push(sql.slice(0, 60)); return prepare(sql); };
    r.db.batch = s => { seen.writes.push('batch'); return batch(s); };
    try { seen.result = await fn(); } finally { r.db.prepare = prepare; r.db.batch = batch; } return seen; };
  return { r, a, sim, declare, wars, proposal, spy, nowS };
}

test('the vote: more than half of ALL seats passes; exactly half (a tie) fails; no seats fails; bad seat counts read as zero', async t => {
  const { a } = await setup(t);
  const vote = (defender, seats) => a.kindleWarVote(defender, seats);
  assert.deepEqual(vote('korund', { 'steady-hand': 6, 'open-ledger': 3, 'dockside-builders': 3 }), { body: 'Assembly', rule: 'majority-of-all-seats', yes: 6, total: 12, passed: false }, '6 of 12 is a tie');
  assert.equal(vote('korund', { 'steady-hand': 6, 'open-ledger': 4, 'dockside-builders': 3 }).passed, true, '7 of 13');
  assert.equal(vote('korund', { 'steady-hand': 7, 'open-ledger': 6, 'dockside-builders': 5 }).passed, true, '11 of 18 (the incumbents)');
  assert.equal(vote('aurelle', { 'steady-hand': 7, 'open-ledger': 6, 'dockside-builders': 5 }).passed, false, '5 of 18');
  assert.equal(vote('korund', { 'steady-hand': 9, 'open-ledger': 9 }).passed, false, 'no quorum: every seat counts in the total, 9 of 18 fails');
  assert.equal(vote('korund', {}).passed, false); assert.equal(vote('korund', { 'open-ledger': -3, 'dockside-builders': NaN, 'steady-hand': 1 }).total, 1);
  // QA3: the denominator is the whole Assembly. An unknown party is counted as not-yes; a party with empty seats does not shrink the others.
  const incumbents = { 'steady-hand': 7, 'open-ledger': 6, 'dockside-builders': 5 };
  assert.deepEqual([vote('korund', { ...incumbents, independents: 3 }).yes, vote('korund', { ...incumbents, independents: 3 }).total, vote('korund', { ...incumbents, independents: 3 }).passed], [11, 21, true], '11 of 21');
  assert.equal(vote('korund', { ...incumbents, independents: 4 }).passed, false, '11 of 22 is a tie: the unknown party counts against');
  assert.deepEqual(vote('korund', { 'steady-hand': 0, 'open-ledger': 6, 'dockside-builders': 5, independents: 7 }), { body: 'Assembly', rule: 'majority-of-all-seats', yes: 11, total: 18, passed: true }, 'an empty party is zero, the rest still count');
  assert.equal(vote('korund', { 'open-ledger': 6, 'dockside-builders': 5, independents: 12 }).passed, false, '11 of 23');
  assert.equal(a.kindleWarVote.length, 2, 'weariness is display only: the vote takes no weariness input');
  assert.doesNotMatch(readFileSync('lib/war-assembly.ts', 'utf8'), /weariness'|readPublicWeariness/, 'the decision never reads weariness');
});

for (const backend of [undefined, 'postgres']) {
  const label = backend ? ' (PGlite)' : '';
  test(`flag on: Kindle's declaration is a proposal; the next tick decides it once by the Assembly; Korund still declares by decree${label}`, async t => {
    const c = await setup(t, backend);
    const rid = randomUUID(), k = await c.declare({ requestId: rid }); assert.equal(k.ok, true);
    assert.equal((await c.declare({ requestId: rid })).proposal.id, k.proposal.id, 'replay by request id'); assert.equal(k.status, 'proposed'); assert.deepEqual(await c.wars(), [], 'nothing is declared before the vote');
    
    assert.equal((await c.declare()).reason, 'proposal_pending', 'one pending proposal per defender');
    const au = await c.declare({ defender: 'aurelle' });
    assert.equal(await c.a.decideKindleWarProposals(c.r.db, c.nowS() + 60), 2);
    const won = await c.proposal(k.proposal.id), lost = await c.proposal(au.proposal.id);
    assert.equal(won.status, 'approved'); assert.deepEqual(JSON.parse(won.vote_json), { body: 'Assembly', rule: 'majority-of-all-seats', yes: 11, total: 18, passed: true });
    assert.deepEqual((await c.wars()).map(w => [w.id, w.defender_nation]), [[won.war_id, 'korund']]);
    assert.deepEqual([lost.status, lost.reject_reason, lost.war_id], ['rejected', 'assembly_rejected', null]);
    assert.equal(await c.a.decideKindleWarProposals(c.r.db, c.nowS() + 120), 0, 'decided once'); assert.equal(Number((await c.proposal(k.proposal.id)).decided_at), c.nowS() + 60);
    const korund = await c.declare({ nation: 'korund', role: 'Chairman', defender: 'aurelle' }); assert.equal(korund.ok, true); assert.ok(korund.war, 'Korund declares by decree');
  });

  test(`decided once under concurrent ticks: one war, one decision; a missing rowcount is never a decision${label}`, async t => {
    const c = await setup(t, backend);
    const k = await c.declare();
    const counts = await Promise.all([c.a.decideKindleWarProposals(c.r.db, c.nowS() + 60), c.a.decideKindleWarProposals(c.r.db, c.nowS() + 60)]);
    assert.equal(counts[0] + counts[1], 1); assert.equal((await c.wars()).length, 1); assert.equal((await c.proposal(k.proposal.id)).status, 'approved');
    const stale = { prepare: sql => { const s = { bind: () => s, first: async () => null, run: async () => ({ meta: {} }), all: async () => ({ results: /status='proposed'/.test(sql) ? [{ id: 'p', request_id: 'req-stale-1', defender_nation: 'aurelle', casus_belli: '', declared_by: 'AI', proposed_at: 1, status: 'proposed', decided_at: null, war_id: null, vote_json: null, reject_reason: null }] : [] }) }; return s; } };
    assert.equal(await c.a.decideKindleWarProposals(stale, c.nowS()), 0, 'no change count, no decision');
  });

  test(`QA3: the reject path is decided once under concurrent ticks: counts (1,0), never (1,1)${label}`, async t => {
    const c = await setup(t, backend);
    const au = await c.declare({ defender: 'aurelle' });
    const counts = await Promise.all([c.a.decideKindleWarProposals(c.r.db, c.nowS() + 60), c.a.decideKindleWarProposals(c.r.db, c.nowS() + 60)]);
    assert.deepEqual([...counts].sort(), [0, 1]); assert.equal((await c.proposal(au.proposal.id)).reject_reason, 'assembly_rejected'); assert.deepEqual(await c.wars(), []);
  });

  test(`QA3: the war vote runs after diplomacy, so a pact ratified on the same tick blocks the declaration${label}`, async t => {
    const c = await setup(t, backend);
    const war = await c.declare();
    const d = await c.r.importModule('lib/diplomacy.ts');
    assert.equal((await d.proposeTreaty(c.r.db, { proposer: 'kindle', other: 'korund', kind: 'non-aggression', proposedBy: 'AI President', requestId: randomUUID() }, c.nowS(), { enabled: true })).ok, true);
    await c.sim.runWorldChains(c.sim.worldRunnerChains(c.r.db, c.nowS() + 60, { diplomacy: true, war: true, warAssembly: true }));
    assert.equal((await c.r.db.prepare("SELECT status FROM treaties WHERE pair_key='kindle:korund'").first()).status, 'in_force', 'ratified this tick');
    assert.deepEqual([(await c.proposal(war.proposal.id)).status, (await c.proposal(war.proposal.id)).reject_reason], ['rejected', 'non_aggression']); assert.deepEqual(await c.wars(), []);
  });

  test(`QA3: with a deliberately slow diplomacy runner, the war vote still sees its pact write${label}`, async t => {
    const c = await setup(t, backend);
    const war = await c.declare();
    const d = await c.r.importModule('lib/diplomacy.ts');
    await d.proposeTreaty(c.r.db, { proposer: 'kindle', other: 'korund', kind: 'non-aggression', proposedBy: 'AI President', requestId: randomUUID() }, c.nowS(), { enabled: true });
    // Every statement issued from lib/diplomacy waits 40 ms first, so a war vote running in parallel would read the proposals before the pact is in force.
    const prepare = c.r.db.prepare.bind(c.r.db), slow = s => { const w = Object.create(s); w.bind = (...a) => slow(s.bind(...a));
      for (const m of ['run', 'first', 'all']) w[m] = async (...a) => { await new Promise(res => setTimeout(res, 40)); return s[m](...a); }; return w; };
    c.r.db.prepare = sql => new Error().stack.includes('/lib/diplomacy.') ? slow(prepare(sql)) : prepare(sql);
    try { await c.sim.runWorldChains(c.sim.worldRunnerChains(c.r.db, c.nowS() + 60, { diplomacy: true, war: true, warAssembly: true })); } finally { c.r.db.prepare = prepare; }
    assert.equal((await c.r.db.prepare("SELECT status FROM treaties WHERE pair_key='kindle:korund'").first()).status, 'in_force');
    assert.equal((await c.proposal(war.proposal.id)).reject_reason, 'non_aggression', 'the vote ran after the slow pact write'); assert.deepEqual(await c.wars(), []);
  });

  test(`the Founding Period, a non-aggression pact and the peace lock are checked again at decision time${label}`, async t => {
    const c = await setup(t, backend);
    const pact = await c.declare();
    await c.r.db.prepare("INSERT INTO treaties (id,request_id,pair_key,kind,proposer_nation,other_nation,proposed_by,proposed_at,status,decided_at,ratified_at,ends_at) VALUES ('t1','t1-request','kindle:korund','non-aggression','kindle','korund','AI',?,'in_force',?,?,?)").bind(c.nowS() - 10, c.nowS() - 5, c.nowS() - 5, c.nowS() + 90 * D).run();
    await c.a.decideKindleWarProposals(c.r.db, c.nowS() + 60);
    assert.deepEqual([(await c.proposal(pact.proposal.id)).status, (await c.proposal(pact.proposal.id)).reject_reason], ['rejected', 'non_aggression']);
    await c.r.db.prepare("DELETE FROM treaties").run();
    await c.r.db.prepare("INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,casus_belli,declared_by,declared_at,mobilization_ends_at,ended_at,end_kind) VALUES ('w0','w0-request','kindle:korund','korund','kindle','','AI',?,?,?,'treaty')").bind(c.nowS() - 20 * D, c.nowS() - 20 * D + 172800, c.nowS() - 2 * D).run();
    const lock = await c.declare(); await c.a.decideKindleWarProposals(c.r.db, c.nowS() + 60);
    assert.equal((await c.proposal(lock.proposal.id)).reject_reason, 'peace_lock');
    await c.r.db.prepare("DELETE FROM wars").run();
    const early = await c.declare(); c.r.setFixtureEnv('HARIMU_SHARD_STARTED_AT', String(c.nowS() - D));
    await c.a.decideKindleWarProposals(c.r.db, c.nowS() + 60);
    assert.equal((await c.proposal(early.proposal.id)).reject_reason, 'founding_period'); assert.deepEqual(await c.wars(), []);
  });

  test(`flag off: Kindle declares directly as before, zero war_proposals statements and no snapshot key; baseline: flag on records them; GETs never write${label}`, async t => {
    const c = await setup(t, backend);
    const off = await c.spy(async () => { const d = await c.declare({}, { assembly: false }); await c.sim.runWorldChains(c.sim.worldRunnerChains(c.r.db, c.nowS(), { war: true, warAssembly: false })); return [d, await c.sim.readWorldSimulation(c.r.db, c.nowS(), { war: true, warAssembly: false })]; });
    assert.ok(off.result[0].war, 'flag off: the war is declared at once'); assert.equal(off.result[0].status, undefined);
    assert.deepEqual(off.sqls.filter(s => /war_proposals/.test(s)), []); assert.equal('warProposals' in off.result[1], false, 'no new GET key');
    await c.r.db.prepare('DELETE FROM war_actions').run(); await c.r.db.prepare('DELETE FROM wars').run();
    const on = await c.spy(async () => { await c.declare(); await c.sim.runWorldChains(c.sim.worldRunnerChains(c.r.db, c.nowS(), { war: true, warAssembly: true })); });
    assert.ok(on.sqls.filter(s => /war_proposals/.test(s)).length > 0, 'the spy fires with the flag on'); assert.equal((await c.wars()).length, 1, 'the tick runner declared it');
    const get = await c.spy(() => c.sim.readWorldSimulation(c.r.db, c.nowS(), { war: true, warAssembly: true }));
    assert.deepEqual(get.writes, [], 'the snapshot read writes nothing'); assert.equal(get.result.warProposals[0].status, 'approved');
  });
}

test('flag, migration 0064, route and wiring', () => {
  const flag = f => [...readFileSync(f, 'utf8').matchAll(/^\s*\/\/ #427[^\n]*\n\s*"HARIMU_WAR_ASSEMBLY_ENABLED"\s*:\s*"([^"]*)"/gm)].map(m => m[1]);
  assert.deepEqual(flag('wrangler.jsonc'), ['true']); assert.deepEqual(flag('wrangler.prod.jsonc'), ['false']);
  for (const f of ['drizzle/0064_war_proposals.sql', 'db/postgres/0064_war_proposals.sql']) {
    const sql = readFileSync(f, 'utf8').replace(/^--[^\n]*\n/gm, '');
    assert.deepEqual(sql.match(/^\s*[A-Z]+ [A-Z]+/gm).map(s => s.trim()), ['CREATE TABLE', 'CREATE UNIQUE'], `${f} is additive only`);
    assert.match(sql, /CHECK\(status='proposed' OR decided_at IS NOT NULL\)/); assert.match(sql, /WHERE status='proposed';/);
  }
  const route = readFileSync('app/api/war/route.ts', 'utf8');
  assert.match(route, /assembly: bindings\.HARIMU_WAR_ASSEMBLY_ENABLED === 'true'/); assert.ok(route.indexOf("HARIMU_WAR_ENABLED !== 'true'") < route.indexOf('HARIMU_WAR_ASSEMBLY_ENABLED ==='));
  const sim = readFileSync('lib/world-simulation.ts', 'utf8'); assert.match(sim, /name: 'warAssembly', on: options\.war === true && options\.warAssembly === true/);
  for (const f of readdirSafe('app')) if (f !== 'app/api/citizen/route.ts') assert.doesNotMatch(readFileSync(f, 'utf8'), /decideKindleWarProposals|warAssembly:/, `${f}: only the citizen POST path runs the vote`);
});
function readdirSafe(dir) { return readdirSync(dir, { recursive: true }).map(p => `${dir}/${p}`).filter(f => /\.tsx?$/.test(f)); }
