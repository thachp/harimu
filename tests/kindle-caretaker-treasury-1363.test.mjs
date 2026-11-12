/** #1363 treasury half: the outgoing Kindle President cannot spend treasury during the certified transition week.
 *  Same flag and the same kindleCertification clock as #1025 / #1365 (24 hours, then 7 days, inclusive of endsAt). No new duration. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { transitionBanner } from '../lib/kindle-certification-copy.ts';
import { kindleCertificationSeconds, kindleTransitionSeconds } from '../lib/kindle-certification-rules.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const D = 86400;
const spendRefusal = `The spend was not made. ${transitionBanner.line.text}`;
const warRefusal = `The declaration was not made. ${transitionBanner.line.text}`;
const closesAt = 1_700_000_000;
const certifiesAt = closesAt + kindleCertificationSeconds;
const endsAt = certifiesAt + kindleTransitionSeconds;
const slate = JSON.stringify([
  { id: 'ines-varro', name: 'Ines Varro', platform: 'Full employment and cautious trade.' },
  { id: 'tobin-achterberg', name: 'Tobin Achterberg', platform: 'Lower levies and open markets.' },
  { id: 'mara-quell', name: 'Mara Quell', platform: 'Public housing and dock building.' },
]);

async function setup(t, backend) {
  const r = await localRuntime(backend ? { backend } : {}); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_SHARD_STARTED_AT', String(certifiesAt - 60 * D));
  const spend = await r.importModule('lib/kindle-caretaker.ts');
  const war = await r.importModule('lib/war.ts');
  return { r, spend, war };
}
const ballot = r => r.db.prepare('INSERT INTO civic_elections (id,nation_id,candidates_json,opens_at,closes_at,closed_at,result_json) VALUES (?,?,?,?,?,?,?)')
  .bind('kindle-presidential-poc-1', 'kindle', slate, closesAt - 72 * 3600, closesAt, closesAt, JSON.stringify({ winner: 'ines-varro' })).run();
const declare = (war, db, now) => war.declareWar(db, { attacker: 'kindle', defender: 'korund', casusBelli: 'Border incidents', declaredBy: 'AI President', requestId: randomUUID() }, now, { enabled: true });
const wars = r => r.db.prepare('SELECT id FROM wars').all().then(x => x.results);

for (const backend of [undefined, 'postgres']) {
  const label = backend ? ' (PGlite)' : '';

  test(`flag on: a presidential treasury spend is blocked on both boundary days and allowed outside the week${label}`, async t => {
    const { r, spend } = await setup(t, backend);
    r.setFixtureEnv('HARIMU_KINDLE_CERTIFICATION_ENABLED', 'true');
    assert.equal((await spend.refuseKindleTreasurySpend(r.db, certifiesAt)).ok, true, 'no closed ballot: the week is not running');
    await ballot(r);
    assert.equal((await spend.refuseKindleTreasurySpend(r.db, certifiesAt - 1)).ok, true, 'still awaiting certification: one second before the week');
    for (const now of [certifiesAt, endsAt]) {
      const blocked = await spend.refuseKindleTreasurySpend(r.db, now);
      assert.equal(blocked.status, 409); assert.equal(blocked.reason, 'caretaker'); assert.equal(blocked.error, spendRefusal);
    }
    assert.equal((await spend.refuseKindleTreasurySpend(r.db, endsAt + 1)).ok, true, 'one second after endsAt the week does not block');
    r.setFixtureEnv('HARIMU_KINDLE_CERTIFICATION_ENABLED', 'false');
    assert.equal((await spend.refuseKindleTreasurySpend(r.db, certifiesAt)).ok, true, 'flag off: a spend is unchanged');
    r.setFixtureEnv('HARIMU_KINDLE_CERTIFICATION_ENABLED', undefined);
    r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_KINDLE_CERTIFICATION_ENABLED: 'true' }));
    assert.equal((await spend.refuseKindleTreasurySpend(r.db, certifiesAt)).reason, 'caretaker', 'the gray pack turns the same flag on');
    r.setFixtureEnv('HARIMU_KINDLE_CERTIFICATION_ENABLED', 'false');
    assert.equal((await spend.refuseKindleTreasurySpend(r.db, certifiesAt)).ok, true, 'a direct false wins over the pack');
  });

  test(`war declarations stay refused inside the week and are unchanged outside it or with the flag off${label}`, async t => {
    const { r, war } = await setup(t, backend);
    r.setFixtureEnv('HARIMU_KINDLE_CERTIFICATION_ENABLED', 'true');
    await ballot(r);
    for (const now of [certifiesAt, endsAt]) {
      const blocked = await declare(war, r.db, now);
      assert.equal(blocked.status, 409); assert.equal(blocked.reason, 'caretaker'); assert.equal(blocked.error, warRefusal);
      assert.equal((await wars(r)).length, 0, 'no wars row');
    }
    assert.equal((await declare(war, r.db, endsAt + 1)).ok, true, 'one second after endsAt a declaration is unchanged');
    await r.db.prepare('DELETE FROM wars').run();
    r.setFixtureEnv('HARIMU_KINDLE_CERTIFICATION_ENABLED', 'false');
    assert.equal((await declare(war, r.db, certifiesAt)).ok, true, 'flag off: a Kindle declaration is unchanged');
  });
}
