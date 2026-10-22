/** #749 Korund gray market: completed trades add private Suspicion (docs 12.9), behind HARIMU_GRAY_SUSPICION_ENABLED. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';
import { suspicionLevel, suspicionLevelWithGray, suspicionBand, deriveDuties, undergroundConfig as cfg } from '../lib/underground-rules.ts';

const DAY = 86400, T0 = 100 * DAY + 3600;

test('rules: a trade adds 2, at most 4 a UTC day from trades; both below one discovery; same decay; discoveries count the same', () => {
  assert.equal(cfg.graySuspicionStep, 2); assert.equal(cfg.graySuspicionDailyCap, 4);
  assert.ok(cfg.graySuspicionStep < cfg.suspicionRepeatStep && cfg.graySuspicionDailyCap < cfg.suspicionRepeatStep, 'below what one discovery adds');
  assert.equal(suspicionLevelWithGray([], [], T0), 0);
  assert.equal(suspicionLevelWithGray([], [T0], T0), 2, 'one trade');
  assert.equal(suspicionLevelWithGray([], [T0, T0 + 60, T0 + 120, T0 + 180], T0 + 200), 4, 'several trades in a day hit the daily cap');
  assert.equal(suspicionLevelWithGray([], [T0, T0 + 60, T0 + DAY, T0 + DAY + 60], T0 + DAY + 100), 8, 'the cap resets the next UTC day (4, then +4 under a day later)');
  assert.equal(suspicionLevelWithGray([], [T0], T0 + 2 * DAY), 0, 'decays 1 per real day like discoveries');
  assert.equal(suspicionLevelWithGray([], [T0], T0 + DAY), 1);
  for (const hits of [[], [T0], [T0, T0 + 3 * DAY], [T0, T0 + 40 * DAY]]) for (const at of [T0 + DAY, T0 + 50 * DAY])
    assert.equal(suspicionLevelWithGray(hits, [], at), suspicionLevel(hits, at), 'no trades: exactly the #382 level');
  assert.equal(suspicionLevelWithGray([T0], [T0 + 60], T0 + 100), 12, 'discovery 10 + trade 2');
  assert.deepEqual(deriveDuties([T0]), [], 'trades never feed duties: deriveDuties takes discoveries only');
});

async function gray(t, on = true) {
  const r = await localRuntime(); t.after(() => r.close());
  await r.db.prepare("UPDATE citizens SET nation_id='korund'").run(); await r.call('world', null);
  r.setFixtureEnv('HARIMU_GRAY_MARKET_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_GRAY_SUSPICION_ENABLED', on ? 'true' : undefined);
  return r;
}
async function shift(r, user) {
  const id = randomUUID(); assert.equal((await r.call('citizen', user, { action: 'korund-start-work', requestId: id })).status, 200);
  r.setNow(r.now + 7200 * 1000); assert.equal((await r.call('citizen', user, { action: 'korund-claim-work', shiftId: id })).status, 200);
}
const view = async (r, user) => (await r.call('citizen', user)).data.korundPlan.gray;
async function trade(r) {
  const offerId = randomUUID();
  assert.equal((await r.call('citizen', 'alice', { action: 'korund-gray-post-offer', requestId: offerId, amountMinor: 100, askRate: 100 })).status, 200);
  assert.equal((await r.call('citizen', 'bob', { action: 'korund-gray-accept-offer', requestId: randomUUID(), offerId })).status, 200);
}

test('flag on: both Korund parties see a private band (word only, never the number) after a trade; GET writes nothing', async t => {
  const r = await gray(t); await shift(r, 'alice');
  assert.equal((await view(r, 'alice')).suspicion, null, 'no trades, no discoveries: no indicator');
  await trade(r);
  for (const user of ['alice', 'bob']) {
    const s = (await view(r, user)).suspicion; assert.ok(s, user); assert.match(s.line, /Low/); assert.doesNotMatch(JSON.stringify(s), /\b2\b/, 'never the number');
  }
  r.setNow(r.now + 3 * 86400 * 1000); assert.equal((await view(r, 'alice')).suspicion, null, 'decayed over the existing window');
});

test('flag off: no suspicion field, view unchanged', async t => {
  const r = await gray(t, false); await shift(r, 'alice'); await trade(r);
  const v = await view(r, 'alice'); assert.equal('suspicion' in v, false);
});

test('foreign party: a citizen outside Korund has no gray view and no gray Suspicion', async t => {
  const r = await gray(t); await shift(r, 'alice'); await trade(r);
  await r.db.prepare("UPDATE citizens SET nation_id='kindle' WHERE clerk_user_id='bob'").run();
  assert.equal((await r.call('citizen', 'bob')).data.korundPlan?.gray, undefined);
});
