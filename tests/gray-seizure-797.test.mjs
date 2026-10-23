/** #797 Korund gray market: checkpoint seizure of cash bundles, destroyed as a money sink (docs 12.9-12.10), behind HARIMU_GRAY_SEIZURE_ENABLED. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';
import { graySeizureConfig as cfg, seizureChanceBps, seizedAmount, seizureRoll, seizureNotice } from '../lib/gray-seizure.ts';
import { reconcileLedger } from '../lib/ledger-reconciliation.ts';

const pickId = hit => { for (;;) { const id = randomUUID(); if (hit ? seizureRoll(id) < 0.02 : seizureRoll(id) >= cfg.maxBps / 10000) return id; } };

test('rules: chance is monotonic in Suspicion and capped; amount is capped and never above the bundle', () => {
  let last = -1;
  for (let level = 0; level <= 100; level++) { const c = seizureChanceBps(level); assert.ok(c >= last && c <= cfg.maxBps, `level ${level}`); last = c; }
  assert.equal(seizureChanceBps(0), cfg.baseBps); assert.equal(seizureChanceBps(100), 2500); assert.equal(cfg.maxBps, 2500, 'issue: at most 25%');
  assert.equal(seizedAmount(0), 0); assert.equal(seizedAmount(1), 1); assert.equal(seizedAmount(100), 50); assert.equal(seizedAmount(5000), cfg.capMinor);
  for (const b of [1, 2, 3, 99, 1999, 2000, 2001, 5000]) assert.ok(seizedAmount(b) <= Math.min(b, cfg.capMinor), String(b));
  assert.equal(seizureRoll('x'), seizureRoll('x'), 'seeded: deterministic');
  assert.equal(seizureNotice(50), 'A checkpoint patrol confiscated 0.50 Labor Notes.');
});

async function gray(t, on = true) {
  const r = await localRuntime(); t.after(() => r.close());
  await r.db.prepare("UPDATE citizens SET nation_id='korund'").run(); await r.call('world', null);
  r.setFixtureEnv('HARIMU_GRAY_MARKET_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_GRAY_SEIZURE_ENABLED', on ? 'true' : undefined);
  const id = randomUUID(); assert.equal((await r.call('citizen', 'alice', { action: 'korund-start-work', requestId: id })).status, 200);
  r.setNow(r.now + 7200 * 1000); assert.equal((await r.call('citizen', 'alice', { action: 'korund-claim-work', shiftId: id })).status, 200);
  return r;
}
async function trade(r, offerId) {
  assert.equal((await r.call('citizen', 'alice', { action: 'korund-gray-post-offer', requestId: offerId, amountMinor: 100, askRate: 100 })).status, 200);
  const res = await r.call('citizen', 'bob', { action: 'korund-gray-accept-offer', requestId: randomUUID(), offerId }); assert.equal(res.status, 200); return res.data;
}
const plan = async (r, user) => (await r.call('citizen', user)).data.korundPlan;
const seizures = async r => (await r.db.prepare('SELECT * FROM gray_seizures ORDER BY seized_at').all()).results;

test('flag off: no roll, no seizure write, no field; trade identical to today', async t => {
  const r = await gray(t, false);
  const prepare = r.db.prepare.bind(r.db), seen = [];
  r.db.prepare = sql => { if (/gray_seizures/.test(sql) && /^\s*(INSERT|UPDATE|DELETE)/i.test(sql)) seen.push(sql); if (/korund_raid_hits/.test(sql)) seen.push('roll'); return prepare(sql); };
  try { const res = await trade(r, pickId(true)); assert.equal('seizedMinor' in res, false); } finally { r.db.prepare = prepare; }
  assert.deepEqual(seen, [], 'no roll and no seizure write');
  assert.deepEqual(await seizures(r), []);
  const p = await plan(r, 'bob'); assert.equal(p.walletMinor, 100); assert.equal('seizure' in p.gray, false);
});

test('flag on: a hit seizes half the bundle, destroys it, shows a notice; one per game day; ledger reconciles', async t => {
  const r = await gray(t);
  const sinkBefore = (await plan(r, 'alice')).walletMinor;
  const res = await trade(r, pickId(true));
  assert.equal(res.seizedMinor, 50); assert.equal(res.notice, 'A checkpoint patrol confiscated 0.50 Labor Notes.');
  const bob = await plan(r, 'bob'); assert.equal(bob.walletMinor, 50, 'buyer keeps the rest'); assert.equal(bob.gray.seizure, res.notice);
  assert.equal((await plan(r, 'alice')).walletMinor, sinkBefore - 100, 'seller is not credited: the seized LN goes to nobody');
  assert.equal((await plan(r, 'alice')).gray.seizure, null);
  // second hit the same game day: no seizure
  const again = await trade(r, pickId(true)); assert.equal('seizedMinor' in again, false); assert.equal((await seizures(r)).length, 1);
  // next game day: may seize again
  r.setNow(r.now + 7200 * 1000); assert.equal((await trade(r, pickId(true))).seizedMinor, 50); assert.equal((await seizures(r)).length, 2);
  // a miss never seizes
  r.setNow(r.now + 7200 * 1000); assert.equal('seizedMinor' in (await trade(r, pickId(false))), false);
  const report = await reconcileLedger(r.db);
  assert.equal(report.totals.LN.mismatches, 0, JSON.stringify(report.mismatches));
  assert.ok(report.totals.LN.debitsMinor >= 100, 'seizures are counted as debits in the daily totals');
  // GET never writes a seizure
  const n = (await seizures(r)).length; await plan(r, 'bob'); assert.equal((await seizures(r)).length, n);
});

test('reconciliation flags a seizure larger than its bundle or charged to someone else', async t => {
  const r = await gray(t); const offerId = pickId(false); await trade(r, offerId);
  await r.db.prepare('INSERT INTO gray_seizures(offer_id,clerk_user_id,game_day,amount_minor,seized_at) VALUES (?,?,?,?,?)').bind(offerId, 'alice', 1, 101, 1).run();
  const report = await reconcileLedger(r.db);
  assert.ok(report.mismatches.some(m => m.check === 'seizure_not_buyer_or_over_bundle'), JSON.stringify(report.mismatches));
});
