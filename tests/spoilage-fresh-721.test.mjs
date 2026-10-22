/** #721: a Kindle citizen who just bought Fruit could not sell it: spoilage runs on every market write in a tick, and a citizen who held no Fruit at the
 *  tick's first run had no spoil row yet, so their next order spoiled the fresh basket (ceil(1/3) = 1) and the sell's escrow check refused it.
 *  Goods bought during the tick are now fresh until the next tick. HARIMU_TEST_STORAGE=postgres runs it on PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { localRuntime } from './helpers/local-runtime.mjs';

const backend = process.env.HARIMU_TEST_STORAGE === 'postgres' ? 'postgres' : 'd1';
const TICK = 7200;

async function setup(t) {
  const r = await localRuntime(); t.after(() => r.close()); r.setOrderBook(true);
  await r.call('citizen', 'alice'); await r.call('citizen', 'bob');
  await r.call('world', null); r.setNow(r.now + (TICK + 100) * 1000); await r.call('world', null); // into tick 1
  const fund = (u, cash, fruit, at = 1) => r.db.batch([
    r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES (?,?,'sell','fixture-cash',-1,?,1)").bind(randomUUID(), u, cash),
    ...(fruit ? [r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES (?,?,'buy','fruit',?,-1,?)").bind(randomUUID(), u, fruit, at)] : []),
  ]);
  const place = (u, side, qty, price) => r.call('market/orders', u, { action: 'market-order-place', requestId: randomUUID(), side, good: 'fruit', qty, limitUnitMinor: price });
  const fruit = async u => Number((await r.db.prepare("SELECT quantity FROM citizen_inventory_balances WHERE clerk_user_id=? AND item='fruit'").bind(u).first())?.quantity ?? 0);
  const spoiled = async u => Number((await r.db.prepare('SELECT COALESCE(SUM(qty),0) AS n FROM market_spoilage WHERE clerk_user_id=?').bind(u).first()).n);
  return { r, fund, place, fruit, spoiled };
}

test(`#721 ${backend}: a basket bought this tick can be sold into the bid on the next order (it does not spoil the same tick)`, async t => {
  const { fund, place, fruit, spoiled } = await setup(t);
  await fund('alice', 5000, 0); await fund('bob', 5000, 0);
  assert.equal((await place('bob', 'buy', 1, 100)).status, 200, 'the 1.00 bid rests');
  const ask = (await place('alice', 'buy', 1, 1000)); assert.equal(ask.status, 200, 'alice buys 1 Fruit from the open ask (the NPC farm ask in this fixture)');
  assert.equal(await fruit('alice'), 1);
  const sell = await place('alice', 'sell', 1, 100);
  assert.equal(sell.status, 200, `the sell into the bid is placed (was 409 order_refused): ${sell.data.error ?? ''}`);
  assert.equal(await spoiled('alice'), 0, 'the fresh basket did not spoil this tick');
  assert.equal(await fruit('alice'), 0, 'it filled against the bid');
});

test(`#721 ${backend}: fresh goods still spoil from the next tick, and goods held before the tick still spoil this tick`, async t => {
  const { r, fund, place, fruit, spoiled } = await setup(t);
  await fund('alice', 5000, 0); await fund('bob', 1, 3); // bob's 3 Fruit predate the tick
  assert.equal((await place('alice', 'buy', 1, 1000)).status, 200); assert.equal(await fruit('alice'), 1);
  await place('alice', 'buy', 1, 1); // any later market write in the same tick runs spoilage again
  assert.equal(await spoiled('alice'), 0, 'not charged in the tick it was bought');
  assert.equal(await spoiled('bob'), 1, 'old stock: ceil(3/3) = 1 spoils this tick, as before');
  r.setNow(r.now + TICK * 1000); await place('alice', 'buy', 1, 1); // tick 2
  assert.equal(await spoiled('alice'), 1, 'the basket bought in tick 1 spoils in tick 2 (ceil(1/3) = 1)');
  assert.equal(await fruit('alice'), 0);
});
