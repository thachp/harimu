/** #1016: Kindle High Court certification on a closed presidential ballot. Flag HARIMU_KINDLE_CERTIFICATION_ENABLED, packed in HARIMU_GRAY_PACK.
 *  Flag off: no certification field and no extra write. 24 hours is the docs figure. The sentences are [ASSUMPTION]. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { kindleCertification, kindleCertificationEnabled, kindleCertificationSeconds } from '../lib/kindle-certification-rules.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const closesAt = 1_700_000_000;
const hour = 3600;
const base = { status: 'closed', closesAt, confirmed: true, winnerName: 'Ines Varro' };

test('rules: awaiting until 24 hours, then certified; open, unconfirmed and a bad clock stay empty', () => {
  assert.equal(kindleCertificationSeconds, 24 * hour);
  const awaiting = kindleCertification({ ...base, now: closesAt + kindleCertificationSeconds - 1 });
  assert.equal(awaiting.state, 'awaiting');
  assert.equal(awaiting.certifiesAt, closesAt + kindleCertificationSeconds);
  assert.match(awaiting.line, /within 24 hours/);
  assert.doesNotMatch(awaiting.line, /President-elect/);
  const certified = kindleCertification({ ...base, now: closesAt + kindleCertificationSeconds });
  assert.equal(certified.state, 'certified');
  assert.equal(certified.line, 'The AI High Court has certified the result. Ines Varro is President-elect.');
  assert.equal(kindleCertification({ ...base, winnerName: null, now: closesAt + kindleCertificationSeconds }).line, 'The AI High Court has certified the result. No winner is named.');
  assert.equal(kindleCertification({ ...base, winnerName: 'A\nB', now: closesAt + kindleCertificationSeconds }).line, 'The AI High Court has certified the result. No winner is named.');
  for (const input of [
    { ...base, status: 'open', now: closesAt + hour },
    { ...base, status: 'waiting', now: closesAt + hour },
    { ...base, confirmed: false, now: closesAt + hour },
    { ...base, closesAt: null, now: closesAt },
    { ...base, now: 1.5 },
  ]) assert.equal(kindleCertification(input), null);
  assert.deepEqual(kindleCertification({ ...base, now: closesAt + hour }), kindleCertification({ ...base, now: closesAt + hour }));
});

test('flag off is off; the gray pack turns it on; a direct string still wins', () => {
  assert.equal(kindleCertificationEnabled({}), false);
  assert.equal(kindleCertificationEnabled({ HARIMU_KINDLE_CERTIFICATION_ENABLED: 'true' }), true);
  const packed = JSON.stringify({ HARIMU_KINDLE_CERTIFICATION_ENABLED: 'true' });
  assert.equal(kindleCertificationEnabled({ HARIMU_GRAY_PACK: packed }), true);
  assert.equal(kindleCertificationEnabled({ HARIMU_GRAY_PACK: { HARIMU_KINDLE_CERTIFICATION_ENABLED: 'true' } }), true);
  assert.equal(kindleCertificationEnabled({ HARIMU_GRAY_PACK: packed, HARIMU_KINDLE_CERTIFICATION_ENABLED: 'false' }), false, 'a direct string wins');
  assert.equal(kindleCertificationEnabled({ HARIMU_GRAY_PACK: '{' }), false);
});

const writePattern = /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i;
function recordWrites(r) {
  const writes = []; const prepare = r.db.prepare.bind(r.db); const batch = r.db.batch.bind(r.db);
  r.db.prepare = sql => { if (writePattern.test(sql)) writes.push(sql); return prepare(sql); };
  r.db.batch = statements => { writes.push('batch'); return batch(statements); };
  return { writes, restore() { r.db.prepare = prepare; r.db.batch = batch; } };
}
const eligible = (r, user) => r.setVerification(user, { userId: user, emailVerified: true, phoneVerified: true, phoneUnique: true, revoked: false, checkedAt: r.now, expiresAt: r.now + 60000 });

test('GET /api/election: flag off omits certification and writes nothing; flag on awaits, then certifies', async t => {
  const r = await localRuntime({ ballotPrivacyReady: true, presidentialCalendar: true }); t.after(() => r.close());
  eligible(r, 'alice');
  const { candidateIds } = await r.importModule('lib/elections.ts');
  const open = await r.call('election', 'alice');
  assert.equal(open.status, 200, JSON.stringify(open.data));
  assert.equal(open.data.status, 'open');
  assert.equal('certification' in open.data, false);
  const voted = await r.call('election', 'alice', { action: 'vote', electionId: open.data.id, requestId: randomUUID(), ranking: [...candidateIds] });
  assert.equal(voted.status, 200, JSON.stringify(voted.data));
  assert.equal('certification' in voted.data, false, 'an open vote response stays unchanged while the flag is off');
  r.setNow(voted.data.closesAt * 1000 + 1000); eligible(r, 'alice');
  const probe = recordWrites(r);
  const closed = await r.call('election', 'alice');
  probe.restore();
  assert.equal(closed.status, 200);
  assert.equal(closed.data.status, 'closed');
  assert.equal('certification' in closed.data, false, 'flag off');
  assert.deepEqual(probe.writes, [], 'flag off the closed read does not write');
  r.setFixtureEnv('HARIMU_KINDLE_CERTIFICATION_ENABLED', 'true');
  const awaiting = await r.call('election', 'alice');
  assert.equal(awaiting.data.certification.state, 'awaiting');
  assert.match(awaiting.data.certification.line, /within 24 hours/);
  assert.doesNotMatch(awaiting.data.certification.line, /President-elect/);
  assert.equal(awaiting.data.certification.certifiesAt, voted.data.closesAt + kindleCertificationSeconds);
  r.setNow((voted.data.closesAt + kindleCertificationSeconds) * 1000);
  eligible(r, 'alice');
  const certified = await r.call('election', 'alice');
  const winner = certified.data.candidates.find(candidate => candidate.id === certified.data.result.winner);
  assert.equal(certified.data.certification.state, 'certified');
  assert.equal(certified.data.certification.line, `The AI High Court has certified the result. ${winner.name} is President-elect.`);
  r.setFixtureEnv('HARIMU_KINDLE_CERTIFICATION_ENABLED', undefined);
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_KINDLE_CERTIFICATION_ENABLED: 'true' }));
  const fromPack = await r.call('election', 'alice');
  assert.equal(fromPack.data.certification.state, 'certified');
  r.setFixtureEnv('HARIMU_KINDLE_CERTIFICATION_ENABLED', 'false');
  const overridden = await r.call('election', 'alice');
  assert.equal('certification' in overridden.data, false, 'a direct false wins over the pack');
});

test('GET /api/election while the ballot is open omits certification even with the flag on', async t => {
  const r = await localRuntime({ ballotPrivacyReady: true, presidentialCalendar: true }); t.after(() => r.close());
  eligible(r, 'alice');
  r.setFixtureEnv('HARIMU_KINDLE_CERTIFICATION_ENABLED', 'true');
  const open = await r.call('election', 'alice');
  assert.equal(open.data.status, 'open');
  assert.equal('certification' in open.data, false);
});
