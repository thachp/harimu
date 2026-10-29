/** #1025: display-only transition week on a certified Kindle ballot. Same flag as #1016. 7 days is the docs window.
 *  [ASSUMPTION] the citizen clock is second-precision UTC, and the week still shows at the exact endsAt instant. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { transitionBanner } from '../lib/kindle-certification-copy.ts';
import { kindleCertification, kindleCertificationSeconds, kindleTransitionLine, kindleTransitionSeconds } from '../lib/kindle-certification-rules.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const closesAt = 1_700_000_000;
const base = { status: 'closed', closesAt, confirmed: true, winnerName: 'Ines Varro' };
const certifiesAt = closesAt + kindleCertificationSeconds;
const endsAt = certifiesAt + kindleTransitionSeconds;

test('three windows on a fixed clock: awaiting, the 7-day week, then gone', () => {
  assert.equal(kindleTransitionSeconds, 7 * 24 * 3600);
  const awaiting = kindleCertification({ ...base, now: certifiesAt - 1 });
  assert.equal(awaiting.state, 'awaiting');
  assert.equal('transition' in awaiting, false);
  const opened = kindleCertification({ ...base, now: certifiesAt });
  assert.equal(opened.state, 'certified');
  assert.equal(opened.transition.endsAt, endsAt);
  assert.equal(opened.transition.line, kindleTransitionLine(endsAt));
  assert.ok(opened.transition.line.startsWith(`${transitionBanner.label}. `));
  assert.ok(opened.transition.line.endsWith(transitionBanner.line.text));
  assert.match(opened.transition.line, /Inauguration \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC/);
  const clock = opened.transition.line.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC/)[0];
  assert.ok(clock.length <= 24, clock);
  const still = kindleCertification({ ...base, now: endsAt });
  assert.equal(still.transition.endsAt, endsAt);
  assert.equal(still.transition.line, opened.transition.line);
  const gone = kindleCertification({ ...base, now: endsAt + 1 });
  assert.equal(gone.state, 'certified');
  assert.equal(gone.line, opened.line);
  assert.equal('transition' in gone, false);
  assert.deepEqual(kindleCertification({ ...base, now: certifiesAt }), kindleCertification({ ...base, now: certifiesAt }));
});

const eligible = (r, user) => r.setVerification(user, { userId: user, emailVerified: true, phoneVerified: true, phoneUnique: true, revoked: false, checkedAt: r.now, expiresAt: r.now + 60000 });

test('GET and POST /api/election: transition only while the certified week is open', async t => {
  const r = await localRuntime({ ballotPrivacyReady: true, presidentialCalendar: true }); t.after(() => r.close());
  eligible(r, 'alice');
  const { candidateIds } = await r.importModule('lib/elections.ts');
  const open = await r.call('election', 'alice');
  assert.equal(open.status, 200, JSON.stringify(open.data));
  const requestId = randomUUID();
  const voted = await r.call('election', 'alice', { action: 'vote', electionId: open.data.id, requestId, ranking: [...candidateIds] });
  assert.equal(voted.status, 200, JSON.stringify(voted.data));
  r.setNow(voted.data.closesAt * 1000 + 1000); eligible(r, 'alice');
  r.setFixtureEnv('HARIMU_KINDLE_CERTIFICATION_ENABLED', 'true');
  const awaiting = await r.call('election', 'alice');
  assert.equal(awaiting.data.certification.state, 'awaiting');
  assert.equal('transition' in awaiting.data.certification, false);
  r.setNow((voted.data.closesAt + kindleCertificationSeconds) * 1000); eligible(r, 'alice');
  const certified = await r.call('election', 'alice');
  assert.equal(certified.data.certification.state, 'certified');
  assert.equal(certified.data.certification.transition.endsAt, voted.data.closesAt + kindleCertificationSeconds + kindleTransitionSeconds);
  assert.match(certified.data.certification.transition.line, /cannot spend the treasury or declare war/);
  const retry = await r.call('election', 'alice', { action: 'vote', electionId: open.data.id, requestId, ranking: [...candidateIds] });
  assert.equal(retry.status, 200, JSON.stringify(retry.data));
  assert.equal(retry.data.alreadyRecorded, true);
  assert.equal(retry.data.certification.transition.endsAt, certified.data.certification.transition.endsAt);
  assert.equal(retry.data.certification.transition.line, certified.data.certification.transition.line);
  r.setNow((certified.data.certification.transition.endsAt + 1) * 1000); eligible(r, 'alice');
  const after = await r.call('election', 'alice');
  assert.equal(after.data.certification.state, 'certified');
  assert.equal('transition' in after.data.certification, false);
  r.setFixtureEnv('HARIMU_KINDLE_CERTIFICATION_ENABLED', 'false');
  const off = await r.call('election', 'alice');
  assert.equal('certification' in off.data, false);
});
