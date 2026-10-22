/** #752: the faith panel's underground Suspicion band uses the same combined source (discoveries + gray-market trades) as the Korund panel, behind HARIMU_GRAY_SUSPICION_ENABLED. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

async function setup(t, on = true) {
  const r = await localRuntime(); t.after(() => r.close());
  await r.db.prepare("UPDATE citizens SET nation_id='korund'").run(); await r.call('world', null);
  r.setFaith(true); r.setFixtureEnv('HARIMU_GRAY_MARKET_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_GRAY_SUSPICION_ENABLED', on ? 'true' : undefined);
  assert.equal((await r.call('faith', 'alice', { action: 'choose-faith', faithId: 'unaffiliated', hiddenFaithId: 'open-hand', requestId: randomUUID() })).status, 200);
  const id = randomUUID(); assert.equal((await r.call('citizen', 'alice', { action: 'korund-start-work', requestId: id })).status, 200);
  r.setNow(r.now + 7200 * 1000); assert.equal((await r.call('citizen', 'alice', { action: 'korund-claim-work', shiftId: id })).status, 200);
  const offerId = randomUUID();
  assert.equal((await r.call('citizen', 'alice', { action: 'korund-gray-post-offer', requestId: offerId, amountMinor: 100, askRate: 100 })).status, 200);
  assert.equal((await r.call('citizen', 'bob', { action: 'korund-gray-accept-offer', requestId: randomUUID(), offerId })).status, 200);
  return r;
}
const faith = async r => (await r.call('faith', 'alice')).data.underground;

test('flag on: the faith panel shows the same band as the Korund panel after a gray trade (GET and POST responses)', async t => {
  const r = await setup(t);
  const korund = (await r.call('citizen', 'alice')).data.korundPlan.gray.suspicion;
  assert.ok(korund); assert.deepEqual((await faith(r)).suspicion, korund, 'one shared band');
  const post = await r.call('faith', 'alice', { action: 'worship-underground', requestId: randomUUID() });
  assert.equal(post.status, 200); assert.deepEqual(post.data.state.underground.suspicion, korund, 'POST state matches too');
  assert.equal((await faith(r)).duty, null, 'gray Suspicion never starts Correction Duty');
  assert.equal(Number((await r.db.prepare('SELECT COUNT(*) n FROM korund_raid_hits').first().catch(() => ({ n: 0 }))).n), 0, 'and is not a raid/discovery');
});

test('flag off: faith panel stays discoveries-only (no band from trades)', async t => {
  const r = await setup(t, false);
  assert.equal((await faith(r)).suspicion, null);
});

test('trades older than the decay window are not read and cannot change the band', async t => {
  const r = await setup(t);
  r.setNow(r.now + 101 * 86400 * 1000); assert.equal((await faith(r)).suspicion, null);
});
