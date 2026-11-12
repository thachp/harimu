/** #465: Spark origin (earned / purchased / unknown). The exchange stays disabled. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { clampSparkLots, convertibleSparkMinor, originForCredit, originQualifiesForConversion, readSparkOriginBalances, recordSparkIssuance, sparkCreditOrigin, sparkDrawOrder, splitTransfer } from '../lib/spark-origin.ts';

const uuid = () => randomUUID();
async function claim(r, user) {
  await r.call('citizen', user, { action: 'commit-work', workOrderId: 'harvest' });
  const shift = (await r.call('citizen', user)).data.shifts.find(s => !s.claimedAt);
  r.setNow(Date.parse(shift.completesAt));
  const res = await r.call('citizen', user, { action: 'claim-work', shiftId: shift.id });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return res.data.economy.walletMinor;
}

test('credit reasons map fail-closed and only earned would convert', async () => {
  assert.equal(originForCredit('wage'), 'earned');
  assert.equal(originForCredit('purchased-spark'), 'purchased');
  for (const reason of ['npc-market-sell', 'npc-order-buy', 'savings-shield', 'starter', 'faucet', 'party-donation', '']) assert.equal(originForCredit(reason), 'unknown', reason);
  assert.deepEqual(Object.keys(sparkCreditOrigin).sort(), ['npc-market-sell', 'npc-order-buy', 'purchased-spark', 'savings-shield', 'wage']);
  assert.deepEqual(sparkDrawOrder, ['unknown', 'purchased', 'earned']);
  const mixed = splitTransfer({ earned: 30, purchased: 50, unknown: 20 }, 60);
  assert.deepEqual(mixed, [{ origin: 'unknown', amount: 20 }, { origin: 'purchased', amount: 40 }]);
  assert.equal(mixed.some(part => part.origin === 'earned'), false, 'a transfer cannot create earned');
  assert.equal(convertibleSparkMinor({ earned: 30, purchased: 50, unknown: 20 }), 30);
  assert.equal(convertibleSparkMinor({ earned: 0, purchased: 80, unknown: 80 }), 0);
  for (const origin of ['purchased', 'unknown']) assert.equal(originQualifiesForConversion(origin), false);
  assert.equal(originQualifiesForConversion('earned'), true);
  for (const file of ['wrangler.jsonc', 'wrangler.prod.jsonc']) {
    const text = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    for (const flag of ['HARIMU_TESSERA_EXCHANGE_ENABLED', 'HARIMU_TESSERA_REWARDS_ENABLED', 'HARIMU_SQUARE_PURCHASE_ENABLED']) assert.match(text, new RegExp(`"${flag}": "false"`), `${file} ${flag}`);
  }
});

test('a new wage is earned, tax stays earned, and a legacy credit stays unknown', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_KINDLE_INCOME_TAX_ENABLED', 'true');
  assert.equal(await claim(r, 'alice'), 680, '15% of 800 withheld');
  const alice = await readSparkOriginBalances(r.db, 'alice');
  assert.deepEqual(alice, { earned: 680, purchased: 0, unknown: 0, total: 680 });
  const rows = (await r.db.prepare("SELECT reason, origin, SUM(delta_minor) AS n FROM spark_origin_entries WHERE clerk_user_id='alice' GROUP BY reason, origin ORDER BY reason").all()).results;
  assert.deepEqual(rows.map(row => [row.reason, row.origin, Number(row.n)]), [['income-tax', 'earned', -120], ['wage', 'earned', 800]]);
  assert.equal((await r.call('citizen', 'alice', { action: 'claim-work', shiftId: (await r.call('citizen', 'alice')).data.shifts[0].id })).status, 200);
  assert.deepEqual(await readSparkOriginBalances(r.db, 'alice'), alice, 'replaying a claim does not mint more earned');
  await r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES ('legacy','bob','sell','food',-1,500,1)").run();
  assert.deepEqual(await readSparkOriginBalances(r.db, 'bob'), { earned: 0, purchased: 0, unknown: 500, total: 500 });
  const closed = await r.call('world/registry', 'alice', { action: 'buy-tessera', tesseraMinor: 100, requestId: uuid() });
  assert.equal(closed.data.reason, 'disabled');
  assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM citizen_tessera_exchanges').first()).n), 0);
});

test('merchant spark is unknown, and a wash trade cannot turn purchased or unknown into earned', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  assert.equal(await claim(r, 'alice'), 800);
  const sold = await r.call('citizen', 'alice', { action: 'market-trade', requestId: uuid(), side: 'sell', item: 'food', quantity: 1 });
  assert.equal(sold.status, 200, sold.data.error);
  assert.deepEqual(await readSparkOriginBalances(r.db, 'alice'), { earned: 800, purchased: 0, unknown: 100, total: 900 });
  const bought = await r.call('citizen', 'alice', { action: 'market-trade', requestId: uuid(), side: 'buy', item: 'food', quantity: 1 });
  assert.equal(bought.status, 200, bought.data.error);
  assert.deepEqual(await readSparkOriginBalances(r.db, 'alice'), { earned: 750, purchased: 0, unknown: 0, total: 750 }, 'the buy spends unknown before earned');
  await r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES ('legacy-bob','bob','sell','food',-1,250,1)").run();
  await r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES ('paid-bob','bob','sell','food',-1,400,1)").run();
  // No production path mints purchased Spark; this direct issuance stands in for that reason.
  await recordSparkIssuance(r.db, 'bob', 400, 'purchase:bob', 'purchased-spark', 2);
  await recordSparkIssuance(r.db, 'bob', 400, 'purchase:bob', 'purchased-spark', 2);
  assert.deepEqual(await readSparkOriginBalances(r.db, 'bob'), { earned: 0, purchased: 400, unknown: 250, total: 650 });
  const list = uuid();
  assert.equal((await r.call('citizen', 'alice', { action: 'create-listing', requestId: list, item: 'food', quantity: 1, unitMinor: 600 })).status, 200);
  assert.equal((await r.call('citizen', 'bob', { action: 'buy-listing', requestId: uuid(), listingId: list })).status, 200);
  assert.deepEqual(await readSparkOriginBalances(r.db, 'bob'), { earned: 0, purchased: 50, unknown: 0, total: 50 });
  assert.deepEqual(await readSparkOriginBalances(r.db, 'alice'), { earned: 750, purchased: 350, unknown: 250, total: 1350 });
  const back = uuid();
  assert.equal((await r.call('citizen', 'bob', { action: 'create-listing', requestId: back, item: 'food', quantity: 1, unitMinor: 600 })).status, 200);
  assert.equal((await r.call('citizen', 'alice', { action: 'buy-listing', requestId: uuid(), listingId: back })).status, 200);
  assert.deepEqual(await readSparkOriginBalances(r.db, 'alice'), { earned: 750, purchased: 0, unknown: 0, total: 750 });
  assert.deepEqual(await readSparkOriginBalances(r.db, 'bob'), { earned: 0, purchased: 400, unknown: 250, total: 650 });
  const earnedIn = Number((await r.db.prepare("SELECT COUNT(*) AS n FROM spark_origin_entries WHERE reason='player-fill' AND origin='earned' AND delta_minor>0").first()).n);
  assert.equal(earnedIn, 0, 'neither leg of the wash was retagged earned');
});

test('clampSparkLots floors lots and never leaves earned above holdings', () => {
  assert.deepEqual(clampSparkLots({ earned: 800, purchased: 0, unknown: -100 }, 700), { earned: 700, purchased: 0, unknown: 0 });
  assert.deepEqual(clampSparkLots({ earned: 800, purchased: 0, unknown: 0 }, 300), { earned: 300, purchased: 0, unknown: 0 }, 'a missed sink spends earned');
  assert.deepEqual(clampSparkLots({ earned: 0, purchased: 0, unknown: 0 }, 200), { earned: 0, purchased: 0, unknown: 200 }, 'a missed credit stays unknown');
  assert.deepEqual(clampSparkLots({ earned: 750, purchased: 50, unknown: 100 }, 900), { earned: 750, purchased: 50, unknown: 100 });
  assert.deepEqual(clampSparkLots({ earned: 100, purchased: 500, unknown: 500 }, 400), { earned: 0, purchased: 0, unknown: 400 });
  const capped = clampSparkLots({ earned: 900, purchased: 50, unknown: 50 }, 400);
  assert.ok(capped.earned <= 400);
  assert.equal(capped.earned + capped.purchased + capped.unknown, 400);
});

test('two concurrent NPC buys and a sink with no origin row cannot inflate earned', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  assert.equal(await claim(r, 'alice'), 800);
  for (let i = 0; i < 2; i++) assert.equal((await r.call('citizen', 'alice', { action: 'market-trade', requestId: uuid(), side: 'sell', item: 'food', quantity: 1 })).status, 200);
  assert.deepEqual(await readSparkOriginBalances(r.db, 'alice'), { earned: 800, purchased: 0, unknown: 200, total: 1000 });
  const buys = await Promise.all([0, 1].map(() => r.call('citizen', 'alice', { action: 'market-trade', requestId: uuid(), side: 'buy', item: 'food', quantity: 1 })));
  assert.deepEqual(buys.map(b => b.status), [200, 200], buys.map(b => b.data.error).join(' '));
  const wallet = (await r.call('citizen', 'alice')).data.economy.walletMinor;
  assert.equal(wallet, 700);
  const raced = await readSparkOriginBalances(r.db, 'alice');
  assert.deepEqual(raced, { earned: 700, purchased: 0, unknown: 0, total: 700 });
  assert.equal(raced.earned + raced.purchased + raced.unknown, wallet);
  await r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES ('missed-sink','alice','buy','food',1,-400,3)").run();
  const missed = await readSparkOriginBalances(r.db, 'alice');
  assert.deepEqual(missed, { earned: 300, purchased: 0, unknown: 0, total: 300 });
  assert.ok(missed.earned <= 300);
});
