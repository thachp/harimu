import type { GameDatabase } from './database-contract';
import { marketGoods, type MarketGood } from './market-orders';

/**
 * Market MVP (#197): limit order book for fruit, meat and wood in the one Kindle city.
 *
 * - Place: one guarded INSERT reserves escrow (the balance views already subtract open orders, #195) and enforces
 *   Kindle citizenship, the open-order cap and request-id uniqueness. The same request id is the order id.
 * - Match: price-time priority against resting orders, partial fills, trade at the resting order's price, never
 *   against the placer's own orders. Each fill is a guarded INSERT into market_trades in one batch (one DB
 *   transaction): it lands only if both orders still have the quantity open, so a stale read can't overfill.
 * - Settlement is only market_trades rows; wallets and inventories derive from them. No balance writes.
 * - Cancel releases only the unfilled remainder (market_open_orders.remaining).
 * No migration: receipts derive from market_orders.id and market_order_cancellations.request_id.
 * Fixed-lot player listings (lib/player-market.ts) stay as they are while this API is behind
 * HARIMU_ORDER_BOOK_ENABLED (default off); #200's board replaces them, and they are retired then.
 */
import { marketFeeSql } from './market-fee'; // #777
import { orderBookCityId, orderBookLimits, matchOrder, tradeSql, type OrderCommand, type OrderBookState, type RestingOrder } from './order-book-rules';
export * from './order-book-rules';
export type BookLevel = { unitMinor: number; qty: number; npc: boolean };
const receiptSql = `SELECT 'place' AS kind, id, citizen_id, side, good, qty, limit_unit_minor, NULL AS order_id FROM market_orders WHERE id = ?
  UNION ALL SELECT 'cancel' AS kind, c.request_id AS id, o.citizen_id, o.side, o.good, o.qty, o.limit_unit_minor, c.order_id FROM market_order_cancellations c JOIN market_orders o ON o.id = c.order_id WHERE c.request_id = ?`;
const placeOrderBase = `INSERT INTO market_orders (id, city_id, citizen_id, npc_id, side, good, qty, limit_unit_minor, created_at)
  SELECT ?, ?, c.clerk_user_id, NULL, ?, ?, ?, ?, ? FROM citizens c
  WHERE c.clerk_user_id = ? AND c.nation_id = 'kindle'
    AND (SELECT COUNT(*) FROM market_open_orders WHERE citizen_id = c.clerk_user_id) < ?
    AND NOT EXISTS (SELECT 1 FROM market_order_cancellations WHERE request_id = ?)`;
/** Buy escrow: the wallet (already net of other open buys) covers qty × limit. Sell escrow: free goods cover qty. */
export const placeBuySql = `${placeOrderBase}
    AND COALESCE((SELECT balance FROM citizen_wallet_balances WHERE clerk_user_id = c.clerk_user_id), 0) >= ?`;
export const placeSellSql = `${placeOrderBase}
    AND COALESCE((SELECT quantity FROM citizen_inventory_balances WHERE clerk_user_id = c.clerk_user_id AND item = ?), 0) >= ?`;
export const cancelOrderSql = `INSERT INTO market_order_cancellations (request_id, order_id, cancelled_at)
  SELECT ?, o.id, ? FROM market_open_orders o WHERE o.id = ? AND o.citizen_id = ?
    AND NOT EXISTS (SELECT 1 FROM market_orders WHERE id = ?)`;

type Receipt = { kind: 'place' | 'cancel'; id: string; citizen_id: string | null; side: string; good: string; qty: number; limit_unit_minor: number; order_id: string | null };
const sameIntent = (r: Receipt | null, userId: string, c: OrderCommand) => !!r && r.citizen_id === userId && (c.action === 'market-order-place'
  ? r.kind === 'place' && r.side === c.side && r.good === c.good && Number(r.qty) === c.qty && Number(r.limit_unit_minor) === c.limitUnitMinor
  : r.kind === 'cancel' && r.order_id === c.orderId);

/** Match an open order against the book. Re-reads after each guarded batch so a concurrent change only shortens the fill.
 *  #679: `known` is the order's own city, good and side when the caller already has them (the NPC farm just posted it), so each round reads the
 *  order and its opposite book together instead of one after the other. A mismatch with the stored order falls back to reading the book again. */
export async function matchOpen(db: GameDatabase, orderId: string, now: number, known?: { cityId: string; good: string; side: 'buy' | 'sell' }, options: { fee?: boolean } = {}) {
  const readBook = (cityId: string, good: string, side: string) => db.prepare(`SELECT id, citizen_id, side, limit_unit_minor, remaining, created_at FROM market_open_orders
      WHERE city_id = ? AND good = ? AND side != ? AND id != ?`).bind(cityId, good, side, orderId).all<RestingOrder>();
  for (let round = 0; round < orderBookLimits.matchRounds; round++) {
    const [me, early] = await Promise.all([
      db.prepare('SELECT id, citizen_id, side, good, city_id, limit_unit_minor, remaining, created_at FROM market_open_orders WHERE id = ?').bind(orderId)
        .first<RestingOrder & { good: string; city_id: string }>(),
      known ? readBook(known.cityId, known.good, known.side) : null,
    ]);
    if (!me) return;
    const sameKey = known && me.city_id === known.cityId && me.good === known.good && me.side === known.side;
    const book = (sameKey && early ? early : await readBook(me.city_id, me.good, me.side)).results
      .map(o => ({ ...o, limit_unit_minor: Number(o.limit_unit_minor), remaining: Number(o.remaining), created_at: Number(o.created_at) }));
    const fills = matchOrder({ side: me.side, limitUnitMinor: Number(me.limit_unit_minor), remaining: Number(me.remaining), citizenId: me.citizen_id }, book);
    if (!fills.length) return;
    // Trade ids are deterministic (order, round, index): a retried batch can't insert a second copy, and ids sort in fill order.
    // #777: with the fee on, each trade INSERT is followed by its guarded fee INSERT in the same batch (no fee row unless the trade row landed).
    const results = await db.batch(fills.flatMap((f, i) => {
      const [buy, sell] = me.side === 'buy' ? [orderId, f.restingId] : [f.restingId, orderId], id = `t:${orderId}:${round}:${String(i).padStart(3, '0')}`;
      const trade = db.prepare(tradeSql).bind(id, f.qty, f.unitMinor, now, buy, sell, f.qty, f.qty, f.unitMinor, f.unitMinor);
      return options.fee ? [trade, db.prepare(marketFeeSql).bind(id)] : [trade];
    }));
    if (results.filter((_, i) => !options.fee || i % 2 === 0).every(r => (r.meta?.changes ?? 0) > 0)) return;
  }
}

export async function executeOrderCommand(db: GameDatabase, userId: string, command: OrderCommand, now: number, options: { fee?: boolean } = {}): Promise<{ status: number; replayed?: boolean; error?: string }> {
  const find = () => db.prepare(receiptSql).bind(command.requestId, command.requestId).first<Receipt>();
  const existing = await find();
  if (existing) return sameIntent(existing, userId, command) ? { status: 200, replayed: true } : { status: 409, error: 'Request identifier already used for another intent.' };
  try {
    if (command.action === 'market-order-place') {
      const base = [command.requestId, orderBookCityId, command.side, command.good, command.qty, command.limitUnitMinor, now,
        userId, orderBookLimits.maxOpenOrders, command.requestId];
      await (command.side === 'buy'
        ? db.prepare(placeBuySql).bind(...base, command.qty * command.limitUnitMinor)
        : db.prepare(placeSellSql).bind(...base, command.good, command.qty)).run();
    } else {
      await db.prepare(cancelOrderSql).bind(command.requestId, now, command.orderId, userId, command.requestId).run();
    }
  } catch (error) {
    // A concurrent identical request won the primary key; fall through to the receipt check.
    if (!(await find())) throw error;
  }
  const saved = await find();
  if (!sameIntent(saved, userId, command)) return { status: 409, error: command.action === 'market-order-place'
    ? 'Order refused: check Kindle citizenship, available Spark or goods for escrow, and the 10 open-order limit.'
    : 'Order not open, already cancelled, or not yours.' };
  if (command.action === 'market-order-place') await matchOpen(db, command.requestId, now, undefined, options);
  return { status: 200 };
}

export async function readOrderBook(db: GameDatabase, userId: string, options: { fee?: boolean } = {}): Promise<OrderBookState> {
  const citizen = await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id = ?').bind(userId).first<{ nation_id: string | null }>();
  type Row = { good: string; side: string; limit_unit_minor: number; qty: number; npc: number };
  const levels = (await db.prepare(`SELECT good, side, limit_unit_minor, SUM(remaining) AS qty, MAX(CASE WHEN npc_id IS NULL THEN 0 ELSE 1 END) AS npc
    FROM market_open_orders WHERE city_id = ? GROUP BY good, side, limit_unit_minor`).bind(orderBookCityId).all<Row>()).results;
  const last = await Promise.all(marketGoods.map(g => db.prepare('SELECT unit_minor FROM market_trades WHERE good = ? ORDER BY filled_at DESC, id DESC LIMIT 1')
    .bind(g.good).first<{ unit_minor: number }>()));
  const mine = (await db.prepare(`SELECT id, side, good, qty, remaining, limit_unit_minor, created_at FROM market_open_orders WHERE citizen_id = ?
    ORDER BY created_at DESC, id`).bind(userId).all<{ id: string; side: 'buy' | 'sell'; good: MarketGood; qty: number; remaining: number; limit_unit_minor: number; created_at: number }>()).results;
  // #777 (flag on only, read-only): the citizen's latest fee lines.
  const fees = options.fee ? (await db.prepare(`SELECT f.trade_id, t.good, t.qty, t.unit_minor, f.fee_minor, t.filled_at FROM market_trade_fees f JOIN market_trades t ON t.id = f.trade_id
    WHERE f.seller_id = ? ORDER BY t.filled_at DESC, f.trade_id DESC LIMIT 5`).bind(userId).all<{ trade_id: string; good: string; qty: number; unit_minor: number; fee_minor: number; filled_at: number }>()).results : null;
  const level = (r: Row): BookLevel => ({ unitMinor: Number(r.limit_unit_minor), qty: Number(r.qty), npc: Number(r.npc) === 1 });
  return {
    available: citizen?.nation_id === 'kindle',
    goods: marketGoods.map((g, i) => {
      const bids = levels.filter(r => r.good === g.good && r.side === 'buy').map(level).sort((a, b) => b.unitMinor - a.unitMinor).slice(0, 5);
      const asks = levels.filter(r => r.good === g.good && r.side === 'sell').map(level).sort((a, b) => a.unitMinor - b.unitMinor).slice(0, 5);
      const lt = last[i];
      return { good: g.good, label: g.label, unit: g.unit, perishable: g.perishable, bestBidMinor: bids[0]?.unitMinor ?? null, bestAskMinor: asks[0]?.unitMinor ?? null,
        bids, asks, lastTradeMinor: lt ? Number(lt.unit_minor) : null };
    }),
    myOrders: mine.map(o => ({ id: o.id, side: o.side, good: o.good, qty: Number(o.qty), remaining: Number(o.remaining), limitUnitMinor: Number(o.limit_unit_minor),
      createdAt: new Date(Number(o.created_at) * 1000).toISOString() })),
    ...(fees ? { myFees: fees.map(f => ({ tradeId: f.trade_id, good: f.good, qty: Number(f.qty), unitMinor: Number(f.unit_minor), feeMinor: Number(f.fee_minor), filledAt: new Date(Number(f.filled_at) * 1000).toISOString() })) } : {}),
  };
}
