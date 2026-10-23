/** #679 (QA1 follow-up on #732): matchOpen reads the book early only when the caller's city/good/side hint equals the stored order; any other hint must
 *  fall back to the stored order's own book, and a hint for a missing order must match nothing. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { localRuntime } from './helpers/local-runtime.mjs';

const backend = process.env.HARIMU_TEST_STORAGE === 'postgres' ? 'postgres' : 'd1';

async function crossedBook(t) {
  const r = await localRuntime(); t.after(() => r.close()); r.setOrderBook(true);
  await r.call('citizen', 'alice'); await r.call('citizen', 'bob');
  await r.db.batch([
    r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES (?,'alice','sell','fixture-cash',-1,5000,1)").bind(randomUUID()),
    r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES (?,'bob','buy','fruit',10,-1,1)").bind(randomUUID()),
  ]);
  const place = (u, side, qty, price) => r.call('market/orders', u, { action: 'market-order-place', requestId: randomUUID(), side, good: 'fruit', qty, limitUnitMinor: price });
  assert.equal((await place('alice', 'buy', 5, 150)).status, 200);
  assert.equal((await place('bob', 'sell', 5, 200)).status, 200);
  const order = u => r.db.prepare('SELECT id, city_id FROM market_open_orders WHERE citizen_id=?').bind(u).first();
  const [bid, ask] = [await order('alice'), await order('bob')];
  // Reprice Bob's resting ask so it now crosses Alice's bid; only a match on Bob's own (fruit, sell) book fills it.
  await r.db.prepare('UPDATE market_orders SET limit_unit_minor=150 WHERE id=?').bind(ask.id).run();
  const trades = async () => (await r.db.prepare('SELECT buy_order_id, sell_order_id, qty, unit_minor FROM market_trades ORDER BY filled_at').all()).results
    .map(row => [row.buy_order_id, row.sell_order_id, Number(row.qty), Number(row.unit_minor)]);
  return { r, bid, ask, trades };
}

const hints = ask => ({ none: undefined, matching: { cityId: ask.city_id, good: 'fruit', side: 'sell' }, 'wrong side': { cityId: ask.city_id, good: 'fruit', side: 'buy' },
  'wrong good': { cityId: ask.city_id, good: 'meat', side: 'sell' }, 'wrong city': { cityId: `${ask.city_id}-elsewhere`, good: 'fruit', side: 'sell' } });

for (const name of ['none', 'matching', 'wrong side', 'wrong good', 'wrong city']) {
  test(`#679 ${backend}: matchOpen with ${name} hint fills against the stored order's own book`, async t => {
    const { r, bid, ask, trades } = await crossedBook(t);
    assert.deepEqual(await trades(), []);
    const { matchOpen } = await r.importModule('lib/order-book.ts');
    await matchOpen(r.db, ask.id, Math.floor(r.now / 1000), hints(ask)[name]);
    assert.deepEqual(await trades(), [[bid.id, ask.id, 5, 150]]);
  });
}

test(`#679 ${backend}: matchOpen with a hint for a missing order matches nothing`, async t => {
  const { r, ask, trades } = await crossedBook(t);
  const { matchOpen } = await r.importModule('lib/order-book.ts');
  await matchOpen(r.db, randomUUID(), Math.floor(r.now / 1000), hints(ask).matching);
  assert.deepEqual(await trades(), []);
});
