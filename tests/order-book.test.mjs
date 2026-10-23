import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { localRuntime } from './helpers/local-runtime.mjs';
import { tradeSql } from '../lib/order-book-rules.ts';
import { matchOrder, validOrderCommand, orderBookLimits, orderBookGoods } from '../lib/order-book-rules.ts';
import { marketGoods } from '../lib/market-orders.ts';

const backend = process.env.HARIMU_TEST_STORAGE === 'postgres' ? 'postgres' : 'd1';
const o = (id, side, price, remaining, created_at, citizen_id = 'x') => ({ id, side, limit_unit_minor: price, remaining, created_at, citizen_id });

test('#197 matching: price-time priority, partial fills, resting price, no self-trade', () => {
  const asks = [o('a3', 'sell', 30, 5, 3), o('a1', 'sell', 25, 2, 2), o('a2', 'sell', 25, 4, 1), o('mine', 'sell', 10, 9, 0, 'me'), o('far', 'sell', 99, 9, 0)];
  assert.deepEqual(matchOrder({ side: 'buy', limitUnitMinor: 30, remaining: 8, citizenId: 'me' }, asks),
    [{ restingId: 'a2', qty: 4, unitMinor: 25 }, { restingId: 'a1', qty: 2, unitMinor: 25 }, { restingId: 'a3', qty: 2, unitMinor: 30 }]);
  const bids = [o('b1', 'buy', 40, 3, 5), o('b2', 'buy', 50, 1, 9), o('b3', 'buy', 20, 9, 1)];
  assert.deepEqual(matchOrder({ side: 'sell', limitUnitMinor: 35, remaining: 10, citizenId: 'me' }, bids),
    [{ restingId: 'b2', qty: 1, unitMinor: 50 }, { restingId: 'b1', qty: 3, unitMinor: 40 }]);
  assert.deepEqual(matchOrder({ side: 'buy', limitUnitMinor: 5, remaining: 1, citizenId: 'me' }, asks), [], 'no cross, no fill');
});
test('#197 command validation bounds', () => {
  assert.deepEqual([...orderBookGoods], marketGoods.map(g => g.good));
  const id = randomUUID();
  assert.ok(validOrderCommand({ action: 'market-order-place', requestId: id, side: 'buy', good: 'fruit', qty: 1, limitUnitMinor: 1 }));
  for (const bad of [{ qty: 0 }, { qty: 1.5 }, { qty: orderBookLimits.maxQty + 1 }, { limitUnitMinor: 0 }, { limitUnitMinor: 2.5 }, { good: 'food' }, { side: 'hold' }, { requestId: 'x' }])
    assert.ok(!validOrderCommand({ action: 'market-order-place', requestId: id, side: 'buy', good: 'fruit', qty: 1, limitUnitMinor: 1, ...bad }), JSON.stringify(bad));
  assert.ok(validOrderCommand({ action: 'market-order-cancel', requestId: id, orderId: randomUUID() }));
  assert.ok(!validOrderCommand({ action: 'market-order-cancel', requestId: id, orderId: 'nope' }));
});

async function market(t, { flag = true } = {}) {
  const r = await localRuntime(); t.after(() => r.close()); r.setOrderBook(flag);
  await r.call('citizen', 'alice'); await r.call('citizen', 'bob');
  // Fixture funding through the existing ledger: cash via a sell event, fruit via a buy event.
  const fund = (u, cash, fruit) => r.db.batch([
    r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES (?,?,'sell','fixture-cash',-1,?,1)").bind(randomUUID(), u, cash),
    ...(fruit ? [r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES (?,?,'buy','fruit',?,-1,1)").bind(randomUUID(), u, fruit)] : []),
  ]);
  await fund('alice', 5000, 0); await fund('bob', 1000, 10);
  const wallet = async u => Number((await r.db.prepare('SELECT balance FROM citizen_wallet_balances WHERE clerk_user_id=?').bind(u).first()).balance);
  const goods = async (u, g = 'fruit') => Number((await r.db.prepare('SELECT quantity FROM citizen_inventory_balances WHERE clerk_user_id=? AND item=?').bind(u, g).first())?.quantity ?? 0);
  const place = (u, side, qty, price, requestId = randomUUID(), good = 'fruit') => r.call('market/orders', u, { action: 'market-order-place', requestId, side, good, qty, limitUnitMinor: price });
  const cancel = (u, orderId, requestId = randomUUID()) => r.call('market/orders', u, { action: 'market-order-cancel', requestId, orderId });
  return { r, wallet, goods, place, cancel };
}

test(`#197 ${backend}: flag off refuses commands; GET reports closed`, async t => {
  const { r, place } = await market(t, { flag: false });
  assert.equal((await place('bob', 'sell', 1, 10)).status, 403);
  assert.deepEqual((await r.call('market/orders', 'bob')).data, { open: false });
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM market_orders').first()).n * 1, 0);
});

test(`#197 ${backend}: partial fills at the resting price, cancel releases only the remainder, conservation holds`, async t => {
  const { wallet, goods, place, cancel } = await market(t);
  const total = async () => (await wallet('alice')) + (await wallet('bob'));
  const cash0 = await total(), bob0 = await wallet('bob'), fruit0 = (await goods('alice')) + (await goods('bob'));
  const s1 = randomUUID(), s2 = randomUUID();
  assert.equal((await place('bob', 'sell', 3, 40, s1)).status, 200);
  assert.equal((await place('bob', 'sell', 4, 30, s2)).status, 200);
  assert.equal(await goods('bob'), 3, 'sell escrow');
  const b = randomUUID(); const res = await place('alice', 'buy', 5, 45, b);
  assert.equal(res.status, 200);
  // Best ask first (30 × 4), then 40 × 1; the buyer pays resting prices.
  assert.equal(await wallet('alice'), 5000 - 4 * 30 - 1 * 40);
  assert.equal(await wallet('bob'), bob0 + 160);
  assert.equal(await goods('alice'), 5);
  const book = res.data.book.goods.find(g => g.good === 'fruit');
  assert.deepEqual([book.bestAskMinor, book.asks[0].qty, book.lastTradeMinor], [40, 2, 40]);
  // Bob cancels the partly filled 40 order: only its 2 remaining return.
  assert.equal((await cancel('bob', s1)).status, 200);
  assert.equal(await goods('bob'), 5);
  assert.equal(await total(), cash0, 'cash conserved'); assert.equal((await goods('alice')) + (await goods('bob')), fruit0, 'goods conserved');
  // A resting buy partially filled, then cancelled, releases escrow only for the rest.
  const b2 = randomUUID(); await place('alice', 'buy', 4, 20, b2);
  assert.equal(await wallet('alice'), 5000 - 160 - 80);
  await place('bob', 'sell', 1, 15);
  assert.equal(await wallet('alice'), 5000 - 160 - 20 - 60, 'paid 1×20, 3×20 still reserved');
  await cancel('alice', b2);
  assert.equal(await wallet('alice'), 5000 - 160 - 20);
  assert.equal((await cancel('alice', b2)).status, 409, 'already cancelled');
  assert.equal(await total(), cash0); assert.equal((await goods('alice')) + (await goods('bob')), fruit0);
});

test(`#197 ${backend}: retries are idempotent, ids cannot be reused, limits and citizenship enforced, no self-trade`, async t => {
  const { r, wallet, goods, place, cancel } = await market(t);
  const id = randomUUID();
  assert.equal((await place('bob', 'sell', 2, 50, id)).status, 200);
  const replay = await place('bob', 'sell', 2, 50, id); assert.equal(replay.status, 200); assert.equal(replay.data.replayed, true);
  assert.equal((await place('bob', 'sell', 3, 50, id)).status, 409, 'same id, other intent');
  assert.equal((await cancel('bob', id, id)).status, 409, 'order id cannot become a cancel id');
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM market_orders').first()).n * 1, 1);
  // Self-trade: bob's crossing buy rests instead of filling against his own ask.
  assert.equal((await place('bob', 'buy', 1, 60)).status, 200);
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM market_trades').first()).n * 1, 0);
  // Retried buy fills once.
  const buy = randomUUID(); await place('alice', 'buy', 2, 50, buy); await place('alice', 'buy', 2, 50, buy);
  assert.equal(await goods('alice'), 2); assert.equal(await wallet('alice'), 5000 - 100);
  // Escrow and caps.
  const spark = await place('alice', 'buy', 100, 10000);
  assert.equal(spark.status, 409, 'cannot reserve more Spark than held');
  assert.equal(spark.data.refusedCheck, 'insufficient_spark', '#733: names the failed check');
  assert.match(spark.data.error, /^Order refused:/, '#733: the error text is unchanged');
  const sell = await place('alice', 'sell', 3, 10);
  assert.equal(sell.status, 409, 'cannot sell goods not held'); assert.equal(sell.data.refusedCheck, 'insufficient_goods');
  for (let i = 0; i < orderBookLimits.maxOpenOrders; i++) assert.equal((await place('alice', 'buy', 1, 1)).status, 200);
  const cap = await place('alice', 'buy', 1, 1);
  assert.equal(cap.status, 409, 'open-order cap'); assert.equal(cap.data.refusedCheck, 'open_order_cap');
  // Cancelling someone else's order is refused.
  const bobBid = (await r.db.prepare("SELECT id FROM market_orders WHERE citizen_id='bob' AND side='buy'").first()).id;
  assert.equal((await cancel('alice', bobBid)).status, 409);
  await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='bob'").run();
  const foreign = await place('bob', 'sell', 1, 10);
  assert.equal(foreign.status, 409, 'non-Kindle citizens rejected'); assert.equal(foreign.data.refusedCheck, 'not_kindle_citizen');
  const again = randomUUID(); await place('alice', 'sell', 1, 10, again);
  assert.equal((await place('alice', 'sell', 1, 10, again)).data.refusedCheck, 'open_order_cap', '#733: a retried refusal names the same check');
  assert.equal((await cancel('bob', bobBid)).status, 200, 'owners can still reclaim escrow after leaving Kindle');
});

test(`#197 ${backend}: concurrent overspend and oversell attempts never double-spend`, async t => {
  const { r, wallet, goods, place } = await market(t);
  const cash0 = (await wallet('alice')) + (await wallet('bob'));
  const buys = await Promise.all([1, 2, 3].map(() => place('alice', 'buy', 1, 3000)));
  assert.equal(buys.filter(x => x.status === 200).length, 1, 'only one 3000 reservation fits 5000');
  assert.ok(await wallet('alice') >= 0);
  const sells = await Promise.all([1, 2, 3].map(() => place('bob', 'sell', 4, 1)));
  // The resting 3000 bid takes 1 from the first sell; free goods never go negative.
  assert.equal(sells.filter(x => x.status === 200).length, 2, '10 fruit cover two 4-lots, not three');
  assert.ok(await goods('bob') >= 0);
  const sold = Number((await r.db.prepare("SELECT COALESCE(SUM(t.qty),0) AS n FROM market_trades t").first()).n);
  assert.equal(sold, 1);
  assert.equal((await wallet('alice')) + (await wallet('bob')), cash0, 'cash conserved');
});

test(`#197 ${backend}: fills are capped at remaining inside the transaction; a stale or racing fill cannot overfill`, async t => {
  const { r, wallet, goods, place } = await market(t);
  const bid = randomUUID(); await place('alice', 'buy', 3, 100, bid);
  const ask = randomUUID(); await place('bob', 'sell', 2, 100, ask);
  assert.equal(Number((await r.db.prepare('SELECT remaining FROM market_open_orders WHERE id=?').bind(bid).first()).remaining), 1);
  // Replaying a stale fill plan (qty 2 against remaining 1) inserts nothing.
  const other = randomUUID(); await place('bob', 'sell', 3, 200, other);
  const stale = await r.db.batch([r.db.prepare(tradeSql).bind('stale', 2, 100, 1, bid, other, 2, 2, 100, 100)]);
  assert.equal(stale[0].meta.changes, 0);
  // Two sellers race for the last unit: exactly one fill lands.
  const racers = await Promise.all([1, 2].map(() => place('bob', 'sell', 1, 50)));
  assert.ok(racers.every(x => x.status === 200));
  const filled = Number((await r.db.prepare('SELECT COALESCE(SUM(qty),0) AS n FROM market_trades WHERE buy_order_id=?').bind(bid).first()).n);
  assert.equal(filled, 3, 'never more than the order quantity');
  assert.equal(await r.db.prepare('SELECT id FROM market_open_orders WHERE id=?').bind(bid).first(), null);
  assert.equal(await goods('alice'), 3); assert.ok(await wallet('alice') >= 0);
});
