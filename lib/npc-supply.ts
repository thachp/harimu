import type { GameDatabase } from './database-contract';
import { matchOpen } from './order-book';
import { orderBookCityId } from './order-book-rules';
import { npcSupply, npcSupplierId, npcQuantity, npcAskMinor, npcOrderId, npcWindowDays, type NpcGood } from './npc-supply-rules';
export * from './npc-supply-rules';

/**
 * #198: once per game day (one world tick), the Kindle farm reposts one sell order per good.
 * - Idempotent per day: the order id is `npc:kindle-farm:<good>:<tick>`; if it exists, that good is done for the day.
 * - Yesterday's unfilled NPC orders are cancelled in the same batch, so at most one NPC ask per good is open.
 * - Quantity shrinks with player sell volume over the trailing window, down to a floor; price never undercuts players.
 * - The new ask is matched against resting player bids like any incoming order (#197 guarded fills).
 * Farm proceeds leave citizen wallets as a Spark sink (NPC sides aren't in citizen views). No schema change.
 */
export async function runNpcSupply(db: GameDatabase, tick: number, scheduledAt: number, now: number, tickSeconds: number) {
  if (!(tick > 0)) return;
  const since = scheduledAt - npcWindowDays * tickSeconds;
  const goods = Object.keys(npcSupply) as NpcGood[];
  // #679: each good's reads touch only that good's orders and trades, which no other good's writes below change, so every good's
  // existence check and pricing reads share one round trip up front. The writes and matching still run one good at a time, in order.
  const reads = await Promise.all(goods.map(good => Promise.all([
    db.prepare('SELECT id FROM market_orders WHERE id = ?').bind(npcOrderId(good, tick)).first(),
    db.prepare(`SELECT COALESCE(SUM(t.qty), 0) AS n FROM market_trades t JOIN market_orders s ON s.id = t.sell_order_id
      WHERE t.good = ? AND s.citizen_id IS NOT NULL AND t.filled_at >= ?`).bind(good, since).first<{ n: number }>(),
    db.prepare(`SELECT MIN(limit_unit_minor) AS p FROM market_open_orders WHERE city_id = ? AND good = ? AND side = 'sell' AND citizen_id IS NOT NULL`)
      .bind(orderBookCityId, good).first<{ p: number | null }>(),
  ])));
  for (const [index, good] of goods.entries()) {
    const id = npcOrderId(good, tick);
    const [existing, sold, best] = reads[index];
    if (existing) continue;
    const qty = npcQuantity(good, Number(sold?.n ?? 0));
    const price = npcAskMinor(good, best?.p == null ? null : Number(best.p));
    const cancelOlder = db.prepare(`INSERT OR IGNORE INTO market_order_cancellations (request_id, order_id, cancelled_at)
        SELECT 'npc-cancel:' || id, id, ? FROM market_open_orders WHERE npc_id = ? AND good = ? AND side = 'sell' AND id != ?`).bind(now, npcSupplierId, good, id);
    // Players already ask at the price cap: retire yesterday's ask and post nothing today.
    if (price === null) { await cancelOlder.run(); continue; }
    await db.batch([
      cancelOlder,
      db.prepare(`INSERT OR IGNORE INTO market_orders (id, city_id, citizen_id, npc_id, side, good, qty, limit_unit_minor, created_at)
        VALUES (?, ?, NULL, ?, 'sell', ?, ?, ?, ?)`).bind(id, orderBookCityId, npcSupplierId, good, qty, price, scheduledAt),
    ]);
    // If matchOpen throws after the insert, the ask simply rests unmatched: fills are guarded and idempotent (#197),
    // and the next player order that crosses it matches normally. No retry needed.
    await matchOpen(db, id, now, { cityId: orderBookCityId, good, side: 'sell' }); // #679: book read alongside the order read
  }
}
