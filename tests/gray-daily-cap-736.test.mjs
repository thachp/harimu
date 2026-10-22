/** #736 Korund gray market: per-citizen daily volume cap (LN posted + LN accepted per real UTC day), behind HARIMU_GRAY_DAILY_CAP_ENABLED. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';
import { GRAY_DAILY_VOLUME_CAP_MINOR, grayDailyRemaining, grayDayStart } from '../lib/gray-market-rules.ts';

const CAP = GRAY_DAILY_VOLUME_CAP_MINOR;
async function gray(t, cap = true) {
  const r = await localRuntime(); t.after(() => r.close());
  await r.db.prepare("UPDATE citizens SET nation_id='korund'").run(); await r.call('world', null);
  r.setFixtureEnv('HARIMU_GRAY_MARKET_ENABLED', 'true'); await addCitizen(r, 'nobody');
  r.setFixtureEnv('HARIMU_GRAY_DAILY_CAP_ENABLED', cap ? 'true' : undefined);
  return r;
}
const addCitizen = (r, user) => r.db.prepare(`INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at)
  VALUES (?,'korund',?,18,1240,'Good standing',?,?)`).bind(user, `Private ${user}`, new Date(r.now).toISOString(), new Date(r.now).toISOString()).run();
const sec = r => Math.floor(r.now / 1000);
const post = (r, user, amountMinor, askRate = 100, requestId = randomUUID()) => r.call('citizen', user, { action: 'korund-gray-post-offer', requestId, amountMinor, askRate });
const accept = (r, user, offerId) => r.call('citizen', user, { action: 'korund-gray-accept-offer', requestId: randomUUID(), offerId });
const view = async (r, user) => (await r.call('citizen', user)).data.korundPlan.gray;
async function shift(r, user) {
  const id = randomUUID(); assert.equal((await r.call('citizen', user, { action: 'korund-start-work', requestId: id })).status, 200);
  r.setNow(r.now + 7200 * 1000); assert.equal((await r.call('citizen', user, { action: 'korund-claim-work', shiftId: id })).status, 200);
}
/** Seed `minor` LN of today's volume for `user` as a closed (already expired) posted offer. */
const seedOne = (r, user, minor, at) => r.db.prepare('INSERT INTO gray_offers(id,clerk_user_id,amount_minor,ask_rate,cash_minor,created_at,expires_at) VALUES (?,?,?,?,?,?,?)')
  .bind(randomUUID(), user, minor, 100, minor, at, at + 1).run();
const seedPosted = async (r, user, minor, at = sec(r) - 60) => { for (let left = minor; left > 0; left -= 5000) await seedOne(r, user, Math.min(5000, left), at); };
const seedAccepted = async (r, user, minor, at = sec(r) - 60) => { for (let left = minor; left > 0; left -= 5000) await seedTrade(r, user, Math.min(5000, left), at); };
const seedTrade = async (r, user, minor, at) => { const id = randomUUID(); await seedOne(r, 'nobody', minor, at);
  const o = await r.db.prepare("SELECT id FROM gray_offers WHERE clerk_user_id='nobody' ORDER BY created_at DESC LIMIT 1").first();
  await r.db.prepare('INSERT INTO gray_trades(offer_id,request_id,seller_id,buyer_id,amount_minor,cash_minor,ask_rate,traded_at) VALUES (?,?,?,?,?,?,?,?)').bind(o.id, id, 'nobody', user, minor, minor, 100, at).run(); };

test('rules: remaining never goes below 0; the day is the real UTC day', () => {
  assert.equal(CAP, 15000); assert.equal(grayDailyRemaining(0), CAP); assert.equal(grayDailyRemaining(CAP), 0); assert.equal(grayDailyRemaining(CAP + 9), 0); assert.equal(grayDailyRemaining(100, 500), 400);
  assert.equal(grayDayStart(86400 * 3 + 5), 86400 * 3); assert.equal(grayDayStart(86400 * 3 - 1), 86400 * 2);
});

test('post: exactly at the cap is allowed, one over is refused with 409 daily_cap; posted and accepted LN both count', async t => {
  const r = await gray(t); await shift(r, 'alice');
  assert.equal((await view(r, 'alice')).dailyRemainingMinor, CAP);
  await seedPosted(r, 'alice', CAP - 400); await seedAccepted(r, 'alice', 200);   // 14,800 used
  assert.equal((await view(r, 'alice')).dailyRemainingMinor, 200);
  const over = await post(r, 'alice', 201); assert.equal(over.status, 409); assert.equal(over.data.reason, 'daily_cap'); assert.match(over.data.error, /Today's limit: 2\.00 LN left/);
  assert.equal(Number((await r.db.prepare("SELECT COUNT(*) n FROM gray_offers WHERE clerk_user_id='alice' AND amount_minor=201").first()).n), 0);
  const at = await post(r, 'alice', 200); assert.equal(at.status, 200, JSON.stringify(at.data));
  assert.equal((await view(r, 'alice')).dailyRemainingMinor, 0);
});

test('accept: the buyer\'s accepted LN counts; over the cap is refused and nothing trades', async t => {
  const r = await gray(t); await shift(r, 'alice');
  const offerId = randomUUID(); assert.equal((await post(r, 'alice', 500, 100, offerId)).status, 200);
  await seedPosted(r, 'bob', CAP - 499);
  const res = await accept(r, 'bob', offerId); assert.equal(res.status, 409); assert.equal(res.data.reason, 'daily_cap');
  assert.equal(Number((await r.db.prepare('SELECT COUNT(*) n FROM gray_trades WHERE offer_id=?').bind(offerId).first()).n), 0);
  await r.db.prepare("DELETE FROM gray_offers WHERE clerk_user_id='bob'").run(); await seedPosted(r, 'bob', CAP - 500);
  const ok = await accept(r, 'bob', offerId); assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal((await view(r, 'bob')).dailyRemainingMinor, 0);
});

test('UTC day rollover: yesterday\'s volume no longer counts', async t => {
  const r = await gray(t); await shift(r, 'alice');
  await seedPosted(r, 'alice', CAP, grayDayStart(sec(r)) - 10); await seedAccepted(r, 'alice', CAP, grayDayStart(sec(r)) - 10);
  assert.equal((await view(r, 'alice')).dailyRemainingMinor, CAP);
  assert.equal((await post(r, 'alice', 500)).status, 200);
});

test('concurrency: two parallel accepts that each fit but together exceed the cap; at most one lands', async t => {
  const r = await gray(t); await addCitizen(r, 'carol'); await shift(r, 'alice'); await shift(r, 'carol');
  const a = randomUUID(), c = randomUUID();
  assert.equal((await post(r, 'alice', 300, 100, a)).status, 200); assert.equal((await post(r, 'carol', 300, 100, c)).status, 200);
  await seedPosted(r, 'bob', CAP - 500);   // room for one 300 LN accept, not two
  const results = await Promise.all([accept(r, 'bob', a), accept(r, 'bob', c)]);
  assert.equal(results.filter(x => x.status === 200).length <= 1, true, JSON.stringify(results.map(x => x.data.reason)));
  const used = Number((await r.db.prepare("SELECT COALESCE(SUM(amount_minor),0) n FROM gray_trades WHERE buyer_id='bob'").first()).n);
  assert.ok(CAP - 500 + used <= CAP);
});

test('flag off: no cap, no limit line, exactly the #43 behaviour', async t => {
  const r = await gray(t, false); await shift(r, 'alice');
  await seedPosted(r, 'alice', CAP * 2);
  const v = await view(r, 'alice'); assert.equal(v.dailyRemainingMinor, undefined); assert.equal(v.dailyCapMinor, undefined);
  assert.equal((await post(r, 'alice', 500)).status, 200);
});
