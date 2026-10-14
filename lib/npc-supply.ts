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
  for (const good of Object.keys(npcSupply) as NpcGood[]) {
    const id = npcOrderId(good, tick);
    if (await db.prepare('SELECT id FROM market_orders WHERE id = ?').bind(id).first()) continue;
    const [sold, best] = await Promise.all([
      db.prepare(`SELECT COALESCE(SUM(t.qty), 0) AS n FROM market_trades t JOIN market_orders s ON s.id = t.sell_order_id
        WHERE t.good = ? AND s.citizen_id IS NOT NULL AND t.filled_at >= ?`).bind(good, since).first<{ n: number }>(),
      db.prepare(`SELECT MIN(limit_unit_minor) AS p FROM market_open_orders WHERE city_id = ? AND good = ? AND side = 'sell' AND citizen_id IS NOT NULL`)
        .bind(orderBookCityId, good).first<{ p: number | null }>(),
    ]);
    const qty = npcQuantity(good, Number(sold?.n ?? 0));
    const price = npcAskMinor(good, best?.p == null ? null : Number(best.p));
    await db.batch([
      db.prepare(`INSERT OR IGNORE INTO market_order_cancellations (request_id, order_id, cancelled_at)
        SELECT 'npc-cancel:' || id, id, ? FROM market_open_orders WHERE npc_id = ? AND good = ? AND side = 'sell' AND id != ?`).bind(now, npcSupplierId, good, id),
      db.prepare(`INSERT OR IGNORE INTO market_orders (id, city_id, citizen_id, npc_id, side, good, qty, limit_unit_minor, created_at)
        VALUES (?, ?, NULL, ?, 'sell', ?, ?, ?, ?)`).bind(id, orderBookCityId, npcSupplierId, good, qty, price, scheduledAt),
    ]);
    await matchOpen(db, id, now);
  }
}
