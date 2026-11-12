/** #1363: the outgoing Kindle President cannot declare war during the certified transition week.
 *  Same flag and the same kindleCertification clock as #1025 (24 hours, then 7 days, inclusive of endsAt). No new duration. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { transitionBanner } from '../lib/kindle-certification-copy.ts';
import { kindleCertificationSeconds, kindleTransitionSeconds } from '../lib/kindle-certification-rules.ts';
import { declarationBlock } from '../lib/war-rules.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const D = 86400, SECRET = 'a-very-long-server-only-secret';
const refusal = `The declaration was not made. ${transitionBanner.line.text}`;
const closesAt = 1_700_000_000;
const certifiesAt = closesAt + kindleCertificationSeconds;
const endsAt = certifiesAt + kindleTransitionSeconds;
const slate = JSON.stringify([
  { id: 'ines-varro', name: 'Ines Varro', platform: 'Full employment and cautious trade.' },
  { id: 'tobin-achterberg', name: 'Tobin Achterberg', platform: 'Lower levies and open markets.' },
  { id: 'mara-quell', name: 'Mara Quell', platform: 'Public housing and dock building.' },
]);

test('caretaker is checked last, so the Founding Period, a pact and the peace lock still win', () => {
  const open = { now: closesAt + 40 * D, shardStartedAt: closesAt, nonAggression: false, lastTreatyEndedAt: null };
  assert.equal(declarationBlock(open), null);
  assert.equal(declarationBlock({ ...open, caretaker: false }), null);
  assert.equal(declarationBlock({ ...open, caretaker: true }), 'caretaker');
  assert.equal(declarationBlock({ ...open, caretaker: true, now: closesAt + D }), 'founding_period');
  assert.equal(declarationBlock({ ...open, caretaker: true, nonAggression: true }), 'non_aggression');
  assert.equal(declarationBlock({ ...open, caretaker: true, lastTreatyEndedAt: open.now - 1 }), 'peace_lock');
});

async function setup(t, backend) {
  const r = await localRuntime(backend ? { backend } : {}); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_SHARD_STARTED_AT', String(certifiesAt - 60 * D));
  const war = await r.importModule('lib/war.ts'), actions = await r.importModule('lib/war-actions.ts'), assembly = await r.importModule('lib/war-assembly.ts');
  const wars = async () => (await r.db.prepare('SELECT id,ended_at FROM wars').all()).results;
  const proposals = async () => (await r.db.prepare('SELECT status,reject_reason,war_id FROM war_proposals').all()).results;
  const clear = async () => { await r.db.prepare('DELETE FROM war_actions').run(); await r.db.prepare('DELETE FROM wars').run(); };
  return { r, war, actions, assembly, wars, proposals, clear };
}
const ballot = r => r.db.prepare('INSERT INTO civic_elections (id,nation_id,candidates_json,opens_at,closes_at,closed_at,result_json) VALUES (?,?,?,?,?,?,?)')
  .bind('kindle-presidential-poc-1', 'kindle', slate, closesAt - 72 * 3600, closesAt, closesAt, JSON.stringify({ winner: 'ines-varro' })).run();
const declare = (war, db, over, now) => war.declareWar(db, { attacker: 'kindle', defender: 'korund', casusBelli: 'Border incidents', declaredBy: 'AI President', requestId: randomUUID(), ...over }, now, { enabled: true });
const command = (actions, db, now, assembly) => actions.handleWarCommand(db, { enabled: true, assembly, secret: SECRET, authorization: `Bearer ${SECRET}`, now, body: { requestId: randomUUID(), action: 'declare', nation: 'kindle', role: 'President', defender: 'korund' } });

for (const backend of [undefined, 'postgres']) {
  const label = backend ? ' (PGlite)' : '';

  test(`flag on and inside the week: declareWar, declareByAuthority, proposeKindleWar and Assembly finalize write no war${label}`, async t => {
    const { r, war, actions, assembly, wars, proposals, clear } = await setup(t, backend);
    r.setFixtureEnv('HARIMU_KINDLE_CERTIFICATION_ENABLED', 'true');
    assert.equal((await declare(war, r.db, {}, certifiesAt)).ok, true, 'no closed ballot: the week is not running');
    await clear();
    await ballot(r);
    assert.equal((await declare(war, r.db, {}, certifiesAt - 1)).ok, true, 'still awaiting certification: one second before the week');
    await clear();
    for (const now of [certifiesAt, endsAt]) {
      const blocked = await declare(war, r.db, {}, now);
      assert.equal(blocked.status, 409); assert.equal(blocked.reason, 'caretaker'); assert.equal(blocked.error, refusal);
      assert.equal((await wars()).length, 0, 'no wars row');
    }
    const byOffice = await command(actions, r.db, certifiesAt, false);
    assert.equal(byOffice.reason, 'caretaker'); assert.equal(byOffice.error, refusal); assert.equal((await wars()).length, 0);
    const byAssembly = await command(actions, r.db, certifiesAt, true);
    assert.equal(byAssembly.reason, 'caretaker'); assert.equal((await proposals()).length, 0); assert.equal((await wars()).length, 0);
    const proposed = await assembly.proposeKindleWar(r.db, { defender: 'korund', declaredBy: 'AI President', requestId: randomUUID() }, certifiesAt);
    assert.equal(proposed.reason, 'caretaker'); assert.equal(proposed.error, refusal); assert.equal((await proposals()).length, 0);
    r.setFixtureEnv('HARIMU_KINDLE_CERTIFICATION_ENABLED', 'false');
    assert.equal((await assembly.proposeKindleWar(r.db, { defender: 'korund', declaredBy: 'AI President', requestId: randomUUID() }, certifiesAt)).ok, true, 'flag off: the proposal is filed');
    r.setFixtureEnv('HARIMU_KINDLE_CERTIFICATION_ENABLED', 'true');
    assert.equal(await assembly.decideKindleWarProposals(r.db, certifiesAt), 1);
    const [decided] = await proposals();
    assert.equal(decided.status, 'rejected'); assert.equal(decided.reject_reason, 'caretaker'); assert.equal(decided.war_id, null); assert.equal((await wars()).length, 0);
    assert.equal((await declare(war, r.db, {}, endsAt + 1)).ok, true, 'one second after endsAt the week does not block');
    await clear();
    r.setFixtureEnv('HARIMU_KINDLE_CERTIFICATION_ENABLED', 'false');
    assert.equal((await declare(war, r.db, {}, certifiesAt)).ok, true, 'flag off: a Kindle declaration is unchanged');
    await clear();
    r.setFixtureEnv('HARIMU_KINDLE_CERTIFICATION_ENABLED', undefined);
    r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_KINDLE_CERTIFICATION_ENABLED: 'true' }));
    assert.equal((await declare(war, r.db, {}, certifiesAt)).reason, 'caretaker', 'the gray pack turns the same flag on');
    assert.equal((await wars()).length, 0);
    r.setFixtureEnv('HARIMU_KINDLE_CERTIFICATION_ENABLED', 'false');
    assert.equal((await declare(war, r.db, {}, certifiesAt)).ok, true, 'a direct false wins over the pack');
  });

  test(`Founding Period, non-aggression, peace lock, Korund and Aurelle are unchanged inside the week${label}`, async t => {
    const { r, war, wars, clear } = await setup(t, backend);
    r.setFixtureEnv('HARIMU_KINDLE_CERTIFICATION_ENABLED', 'true');
    await ballot(r);
    r.setFixtureEnv('HARIMU_SHARD_STARTED_AT', String(certifiesAt - D));
    assert.equal((await declare(war, r.db, {}, certifiesAt)).reason, 'founding_period');
    assert.equal((await wars()).length, 0);
    r.setFixtureEnv('HARIMU_SHARD_STARTED_AT', String(certifiesAt - 60 * D));
    const pact = randomUUID();
    await r.db.prepare("INSERT INTO treaties (id,request_id,pair_key,kind,proposer_nation,other_nation,proposed_by,proposed_at,status,decided_at,ratified_at,ends_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(pact, pact, 'kindle:korund', 'non-aggression', 'kindle', 'korund', 'AI', certifiesAt - 110, 'in_force', certifiesAt - 100, certifiesAt - 100, certifiesAt + 1000).run();
    assert.equal((await declare(war, r.db, {}, certifiesAt)).reason, 'non_aggression');
    await r.db.prepare('DELETE FROM treaties').run();
    await r.db.prepare("INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,casus_belli,declared_by,declared_at,mobilization_ends_at,ended_at,end_kind) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .bind('w-lock', 'w-lock-request', 'kindle:korund', 'korund', 'kindle', '', 'AI', certifiesAt - 20 * D, certifiesAt - 20 * D + 172800, certifiesAt - 2 * D, 'treaty').run();
    assert.equal((await declare(war, r.db, {}, certifiesAt)).reason, 'peace_lock');
    assert.equal((await wars()).length, 1, 'the old treaty stays; no new war');
    await clear();
    assert.equal((await declare(war, r.db, { attacker: 'korund', defender: 'aurelle' }, certifiesAt)).ok, true, 'Korund is unchanged');
    assert.equal((await declare(war, r.db, { attacker: 'aurelle', defender: 'kindle' }, certifiesAt)).ok, true, 'Aurelle is unchanged');
  });
}
