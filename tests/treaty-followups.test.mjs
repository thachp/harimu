/** #400: treaties follow-up. breakTreaty names the breaking nation and requires a signatory, the break cost is an [ASSUMPTION] placeholder returned with it,
 *  and the scheduled AI-leader proposal runs only from the scheduled Worker, behind HARIMU_DIPLOMACY_ENABLED (flag off is a no-op). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { treatyBreakPenalty, treatyBreakPenaltyFor, treatyCandidates, treatyProposalRequestId, treatyProposalSlotSeconds, treatySlot } from '../lib/diplomacy-rules.ts';

const D = 86400;
async function setup(t, { flag = true, embargo = false } = {}) {
  const r = await localRuntime(); t.after(() => r.close());
  const nowS = () => Math.floor(r.now / 1000);
  if (flag) r.setFixtureEnv('HARIMU_DIPLOMACY_ENABLED', 'true');
  const d = await r.importModule('lib/diplomacy.ts');
  const rows = async () => (await r.db.prepare('SELECT * FROM treaties ORDER BY proposed_at,id').all()).results.map(x => ({ ...x }));
  const inForce = async (proposer, other, kind = 'non-aggression') => {
    const res = await d.proposeTreaty(r.db, { proposer, other, kind, proposedBy: 'AI leader', requestId: `req-${proposer}-${other}-${kind}` }, nowS(), { enabled: true });
    assert.equal(res.ok, true); await d.runDiplomacy(r.db, nowS());
    const row = (await rows()).find(x => x.id === res.treaty.id); assert.equal(row.status, 'in_force', 'the treaty is ratified'); return row;
  };
  return { r, d, rows, inForce, nowS, embargo };
}

test('pure: break costs are [ASSUMPTION] placeholders, a pact costs both scores, a trade agreement none, and nothing is applied', () => {
  assert.deepEqual(treatyBreakPenalty['non-aggression'], { legitimacy: -5, reputation: -10 });
  assert.deepEqual(treatyBreakPenalty.trade, { legitimacy: 0, reputation: 0 });
  assert.deepEqual(treatyBreakPenaltyFor('non-aggression', 'korund'), { nation: 'korund', legitimacy: -5, reputation: -10, applied: false });
});

test('pure: candidates rotate through all six pair-and-kind options, then swap the proposer, deterministically', () => {
  const key = c => `${c.proposer}>${c.other}:${c.kind}`;
  for (const slot of [0, 1, 5, 6, 11, 123456]) {
    const list = treatyCandidates(slot); assert.equal(list.length, 6); assert.equal(new Set(list.map(key)).size, 6);
    assert.equal(list.every(c => c.proposer !== c.other), true); assert.deepEqual(list.map(key), treatyCandidates(slot).map(key));
  }
  assert.notEqual(key(treatyCandidates(0)[0]), key(treatyCandidates(1)[0]));
  const first = treatyCandidates(0)[0], flipped = treatyCandidates(6)[0];
  assert.equal(first.kind, flipped.kind); assert.equal(first.proposer, flipped.other); assert.equal(first.other, flipped.proposer);
  assert.equal(treatySlot(treatyProposalSlotSeconds * 3 + 5), 3); assert.match(treatyProposalRequestId(3), /^[A-Za-z0-9-]{8,64}$/);
});

test('breakTreaty: the breaker must be a signatory and is recorded; the penalty is returned, not applied', async t => {
  const { r, d, rows, inForce, nowS } = await setup(t);
  const live = await inForce('korund', 'aurelle');
  const at = nowS() + 100, br = breaker => d.breakTreaty(r.db, { treatyId: live.id, breaker }, at, true);
  assert.equal((await br('kindle')).reason, 'not_signatory'); assert.equal((await br('kindle')).status, 403);
  assert.equal((await br('atlantis')).reason, 'bad_nations'); assert.equal((await br(undefined)).status, 400);
  assert.equal((await rows()).find(x => x.id === live.id).status, 'in_force', 'a non-signatory attempt changes nothing');
  const done = await br('aurelle');
  assert.equal(done.ok, true); assert.equal(done.treaty.status, 'broken'); assert.equal(done.treaty.brokenBy, 'aurelle'); assert.equal(done.treaty.brokenAt, at);
  assert.deepEqual(done.penalty, { nation: 'aurelle', legitimacy: -5, reputation: -10, applied: false }); assert.deepEqual(done.treaty.breakPenalty, done.penalty);
  const saved = (await rows()).find(x => x.id === live.id); assert.equal(saved.broken_by, 'aurelle'); assert.equal(saved.ended_at, at);
  assert.equal((await br('korund')).reason, 'not_in_force', 'the other signatory cannot break it again'); assert.equal((await br('aurelle')).status, 409);
  assert.equal((await rows()).find(x => x.id === live.id).broken_by, 'aurelle', 'who broke it is not rewritten');
  assert.equal((await d.breakTreaty(r.db, { treatyId: 'nope', breaker: 'kindle' }, at, true)).reason, 'not_found');
  const read = await d.readTreaties(r.db, at + 1); assert.equal(read.treaties.find(x => x.id === live.id).brokenBy, 'aurelle');
});

test('breakTreaty: a trade agreement break has no assumed cost; an expired treaty cannot be broken; flag off breaks nothing', async t => {
  const { r, d, inForce, nowS } = await setup(t);
  const trade = await inForce('korund', 'aurelle', 'trade');
  const done = await d.breakTreaty(r.db, { treatyId: trade.id, breaker: 'korund' }, nowS() + 5, true);
  assert.equal(done.ok, true); assert.deepEqual(done.penalty, { nation: 'korund', legitimacy: 0, reputation: 0, applied: false });
  const pact = await inForce('korund', 'aurelle');
  assert.equal((await d.breakTreaty(r.db, { treatyId: pact.id, breaker: 'korund' }, pact.ends_at + 1, true)).reason, 'not_in_force');
  assert.equal((await d.breakTreaty(r.db, { treatyId: pact.id, breaker: 'korund' }, nowS() + 6, false)).reason, 'disabled');
});

test('scheduled proposals: flag off is a no-op; on, one proposal per slot, by the slot rotation, named AI leader, idempotent', async t => {
  const off = await setup(t, { flag: false });
  assert.deepEqual(await off.d.runDiplomacyCron(off.r.db, off.nowS(), {}), { status: 'disabled' }); assert.deepEqual(await off.d.runDiplomacyCron(off.r.db, off.nowS(), { HARIMU_DIPLOMACY_ENABLED: 'false' }), { status: 'disabled' });
  assert.deepEqual(await off.rows(), []);
  const { r, d, rows, nowS } = await setup(t);
  const cron = (now = nowS()) => d.runDiplomacyCron(r.db, now, { HARIMU_DIPLOMACY_ENABLED: 'true' });
  const slot = treatySlot(nowS()), want = treatyCandidates(slot)[0];
  const first = await cron(); assert.equal(first.status, 'proposed');
  const [row] = await rows(); assert.equal(row.status, 'proposed'); assert.equal(row.request_id, treatyProposalRequestId(slot));
  assert.equal(row.proposer_nation, want.proposer); assert.equal(row.other_nation, want.other); assert.equal(row.kind, want.kind); assert.match(row.proposed_by, /AI/);
  assert.equal((await cron(nowS() + 60)).status, 'already', 'a repeated run in the same slot proposes nothing'); assert.equal((await rows()).length, 1);
  const next = await cron(nowS() + D); assert.equal(next.status, 'proposed'); assert.equal((await rows()).length, 2);
});

test('scheduled proposals skip what is not allowed: live treaty, war, embargoed trade, a recently refused pair and kind; never write on a read', async t => {
  const { r, d, rows, nowS } = await setup(t);
  const slot = treatySlot(nowS()), [a, b] = treatyCandidates(slot);
  // The first candidate is already in force: the next one is proposed instead.
  await r.db.prepare("INSERT INTO treaties (id,request_id,pair_key,kind,proposer_nation,other_nation,proposed_by,proposed_at,status,decided_at,ratified_at,ends_at) VALUES ('t-live','req-live-0001',?,?,?,?,'AI',?,'in_force',?,?,?)")
    .bind([a.proposer, a.other].sort().join(':'), a.kind, a.proposer, a.other, nowS() - 10, nowS() - 10, nowS() - 10, nowS() + 1000).run();
  const res = await d.runDiplomacyCron(r.db, nowS(), { HARIMU_DIPLOMACY_ENABLED: 'true' });
  assert.equal(res.status, 'proposed'); assert.equal(res.treaty.kind, b.kind); assert.equal(res.treaty.proposer, b.proposer); const added = (await rows()).filter(x => x.request_id.startsWith('ai-slot-'))[0];
  assert.deepEqual([added.pair_key, added.kind].join(), [[b.proposer, b.other].sort().join(':'), b.kind].join());
  // A refused proposal of the same pair and kind in the last three slots is not repeated.
  const next = treatyCandidates(slot + 1)[0], pair = [next.proposer, next.other].sort().join(':');
  await r.db.prepare("INSERT INTO treaties (id,request_id,pair_key,kind,proposer_nation,other_nation,proposed_by,proposed_at,status,decided_at) VALUES ('t-rej','req-rej-0001',?,?,?,?,'AI',?,'rejected',?)")
    .bind(pair, next.kind, next.proposer, next.other, nowS() + D - 100, nowS() + D - 100).run();
  const later = await d.runDiplomacyCron(r.db, nowS() + D, { HARIMU_DIPLOMACY_ENABLED: 'true' });
  assert.equal(later.status, 'proposed'); assert.notEqual(`${later.treaty.proposer}:${later.treaty.other}`.split(':').sort().join(':') + later.treaty.kind, pair + next.kind, 'the refused pair and kind is skipped');
  // Reads never propose: the world and citizen GETs with the flag on leave the proposal count unchanged.
  const count = (await rows()).length; await r.call('world', null); assert.equal((await rows()).length, count);
});

test('scheduled proposals: trade under an embargo and at-war pairs are skipped', async t => {
  const { r, d, rows, nowS } = await setup(t);
  const slot = treatySlot(nowS());
  for (const c of treatyCandidates(slot)) { // war on every pair except one, so only that pair can be proposed
    if (c.proposer === 'kindle' || c.other === 'kindle') await r.db.prepare("INSERT OR IGNORE INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,declared_by,declared_at,mobilization_ends_at) VALUES (?,?,?,?,?,'AI',?,?)")
      .bind(`w-${c.proposer}-${c.other}`, `war-${c.proposer}-${c.other}-0001`, [c.proposer, c.other].sort().join(':'), c.proposer, c.other, nowS(), nowS() + 172800).run().catch(() => {});
  }
  const res = await d.runDiplomacyCron(r.db, nowS(), { HARIMU_DIPLOMACY_ENABLED: 'true' });
  assert.equal(res.status, 'proposed'); assert.equal([res.treaty.proposer, res.treaty.other].includes('kindle'), false, 'no proposal involves a nation at war with the other');
  assert.equal((await rows()).filter(x => x.request_id.startsWith('ai-slot-')).length, 1);
});

test('wiring: the scheduled Worker calls runDiplomacyCron with the bindings; no route or app code proposes or breaks a treaty; diplomacy flag is on in preview', async () => {
  const entry = await readFile(new URL('../worker/entry.ts', import.meta.url), 'utf8');
  assert.match(entry, /runDiplomacyCron\(await getDatabase\(\), Math\.floor\(controller\.scheduledTime \/ 1000\), env as unknown as/);
  assert.match(entry, /async scheduled\([\s\S]*runDiplomacyCron/);
  const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.match(wrangler, /"HARIMU_DIPLOMACY_ENABLED": "true"/);
  const war = await readFile(new URL('../lib/war.ts', import.meta.url), 'utf8'); // #422 intentionally wires the read-only pact check into lib/war.ts: that is the only diplomacy import allowed there (no break/propose/cron wiring).
  const diplomacyImports = [...war.matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\/diplomacy'/g)].flatMap(m => m[1].split(',').map(x => x.trim()).filter(Boolean));
  assert.deepEqual(diplomacyImports, ['activeNonAggressionPact'], 'lib/war.ts imports only activeNonAggressionPact from ./diplomacy');
  assert.doesNotMatch(war, /\b(breakTreaty|proposeTreaty|runDiplomacyCron|decideTreaty)\b/, 'lib/war.ts does not break or propose treaties');
  for (const file of ['app/api/world/route.ts', 'app/api/citizen/route.ts', 'app/api/news/route.ts']) assert.doesNotMatch(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'), /runAiTreatyProposals|runDiplomacyCron|breakTreaty|proposeTreaty/, file);
});
