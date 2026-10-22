/** #427 slice 3: Kindle's AI seats weigh war weariness in the Assembly's war and ending votes (docs 13.5, 15.3). Behind the existing flags: weariness counts only while
 *  HARIMU_WAR_WEARINESS_ENABLED is on (with HARIMU_WAR_ENABLED); off, every vote is as before. Read once at decision time and recorded with the vote; decide-once unchanged.
 *  SQLite and PGlite. Fixed clocks only. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

const D = 86400, WEEK = 50400, SECRET = 'a-very-long-server-only-secret';
const incumbents = { 'steady-hand': 7, 'open-ledger': 6, 'dockside-builders': 5 };

test('pure: each party turns toward peace at its tolerance (Open Ledger at 8, the others at 20): no on war, yes on surrender and ceding; receiving is not weighed', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const [rules, a, e] = await Promise.all(['lib/war-rules.ts', 'lib/war-assembly.ts', 'lib/war-endings.ts'].map(m => r.importModule(m)));
  assert.deepEqual([7, 8, 19, 20].map(w => rules.wearyKindleParties(w)), [[], ['open-ledger'], ['open-ledger'], ['steady-hand', 'open-ledger', 'dockside-builders']]);
  assert.equal(rules.kindlePartyWeary('independents', 99), false, 'an unknown party is never weary'); assert.equal(rules.kindlePartyWeary('open-ledger', NaN), false);
  assert.deepEqual([0, 7, 8, 20].map(w => [a.kindleWarVote('korund', incumbents, w).yes, a.kindleWarVote('korund', incumbents, w).passed]), [[11, true], [11, true], [5, false], [0, false]], 'war on Korund');
  assert.deepEqual(a.kindleWarVote('korund', incumbents, 8), { body: 'Assembly', rule: 'majority-of-all-seats', yes: 5, total: 18, passed: false, weariness: 8, weary: ['open-ledger'] }, 'the weariness is recorded');
  assert.equal('weariness' in a.kindleWarVote('korund', incumbents, 0), false, 'no weariness, no new field');
  const split = { 'steady-hand': 6, 'open-ledger': 3, 'dockside-builders': 9 };
  assert.deepEqual([0, 8, 20].map(w => e.kindleEndingVote('surrender', split, w).yes), [9, 9, 18], 'surrender: Dockside joins only at severe');
  assert.deepEqual([0, 19, 20].map(w => e.kindleEndingVote('cede', { 'steady-hand': 6, 'open-ledger': 5, 'dockside-builders': 7 }, w).passed), [false, false, true], 'ceding reaches two-thirds when Dockside tires');
  assert.deepEqual(e.kindleEndingVote('receive', { 'steady-hand': 0, 'open-ledger': 0, 'dockside-builders': 0, x: 4 }, 99), { nation: 'kindle', body: 'Assembly', rule: 'two-thirds', yes: 0, total: 4, passed: false }, 'receiving is not weighed');
  assert.equal(e.decideEnding('surrender', 'kindle', 'korund', split, 20).passed, true); assert.equal(e.decideEnding('surrender', 'korund', 'kindle', {}, 99).ratifications[0].body, 'Chairman', 'only Kindle weighs it');
});

for (const backend of [undefined, 'postgres']) {
  const label = backend ? ' (PGlite)' : '';
  async function setup(t) {
    const r = await localRuntime(backend ? { backend } : {}); t.after(() => r.close());
    const nowS = Math.floor(r.now / 1000); r.setFixtureEnv('HARIMU_SHARD_STARTED_AT', String(nowS - 90 * D));
    const [actions, sim, e] = await Promise.all(['lib/war-actions.ts', 'lib/world-simulation.ts', 'lib/war-endings.ts'].map(m => r.importModule(m)));
    // Kindle has been at war with Aurelle for 5 game weeks since mobilization: 2 x 1.5 x 5 = 15 weariness points (high: Open Ledger is weary).
    const mob = nowS - 5 * WEEK - 10;
    await r.db.prepare("INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,casus_belli,declared_by,declared_at,mobilization_ends_at) VALUES ('w-old','w-old-request','aurelle:kindle','aurelle','kindle','','AI',?,?)").bind(mob - 172800, mob).run();
    const command = body => actions.handleWarCommand(r.db, { enabled: true, assembly: true, endings: true, secret: SECRET, authorization: `Bearer ${SECRET}`, body: { requestId: randomUUID(), ...body }, now: nowS });
    const tick = (weariness, at = nowS + 60) => sim.runWorldChains(sim.worldRunnerChains(r.db, at, { war: true, warAssembly: true, warEndings: true, warWeariness: weariness }));
    const row = async (table, id) => ({ ...(await r.db.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(id).first()) });
    return { r, e, command, tick, row, nowS };
  }

  test(`war vote: with the weariness flag on, a weary Open Ledger sinks Kindle's war on Korund (5 of 18), recorded; flag off, the same vote passes as before${label}`, async t => {
    const on = await setup(t), p = await on.command({ action: 'declare', nation: 'kindle', role: 'President', defender: 'korund' });
    await on.tick(true);
    const row = await on.row('war_proposals', p.proposal.id);
    assert.deepEqual([row.status, row.reject_reason, JSON.parse(row.vote_json)], ['rejected', 'assembly_rejected', { body: 'Assembly', rule: 'majority-of-all-seats', yes: 5, total: 18, passed: false, weariness: 15, weary: ['open-ledger'] }]);
    const off = await setup(t), q = await off.command({ action: 'declare', nation: 'kindle', role: 'President', defender: 'korund' });
    await off.tick(false);
    const before = await off.row('war_proposals', q.proposal.id); assert.equal(before.status, 'approved'); assert.equal('weariness' in JSON.parse(before.vote_json), false);
  });

  test(`endings: Kindle's surrender vote records the weariness it weighed; read once per tick at decision time, and never with the flag off (spy, with a flag-on baseline)${label}`, async t => {
    const c = await setup(t);
    const s = await c.command({ action: 'surrender', nation: 'kindle', role: 'President', warId: 'w-old' });
    const reads = async (weariness) => { const prepare = c.r.db.prepare.bind(c.r.db), original = c.r.db.prepare; let n = 0;
      c.r.db.prepare = sql => { if (/FROM wars WHERE mobilization_ends_at<=\?/.test(sql)) n++; return prepare(sql); };
      try { await c.e.decideWarEndings(c.r.db, c.nowS + 60, { enabled: weariness }); } finally { c.r.db.prepare = original; } return n; };
    // Flag off first: the vote is decided with no weariness read at all.
    const c2 = await setup(t); const s2 = await c2.command({ action: 'surrender', nation: 'kindle', role: 'President', warId: 'w-old' });
    const prepare = c2.r.db.prepare.bind(c2.r.db), original = c2.r.db.prepare; let offReads = 0;
    c2.r.db.prepare = sql => { if (/FROM wars WHERE mobilization_ends_at<=\?/.test(sql)) offReads++; return prepare(sql); };
    try { await c2.e.decideWarEndings(c2.r.db, c2.nowS + 60, { enabled: false }); } finally { c2.r.db.prepare = original; }
    assert.equal(offReads, 0, 'flag off: weariness is never read'); assert.equal('weariness' in JSON.parse((await c2.row('war_end_terms', s2.terms.id)).ratification_json)[0], false);
    assert.equal(await reads(true), 1, 'baseline: read exactly once per tick when on');
    const rat = JSON.parse((await c.row('war_end_terms', s.terms.id)).ratification_json)[0];
    assert.deepEqual([rat.body, rat.yes, rat.total, rat.weariness, rat.weary], ['Assembly', 13, 18, 15, ['open-ledger']]);
    assert.equal(await reads(true), 0, 'decided once: nothing pending, nothing read');
  });
}
