import type { GameDatabase } from './database-contract';
import { allocateSpoilage, shelfLifeDays, spoilQuantity, type PerishableGood } from './spoilage-rules';
export * from './spoilage-rules';

/**
 * #199: once per game day (world tick), fruit and meat held by citizens spoil. Wood never spoils.
 * - Loss = ceil(held / shelf life), held = free inventory + goods escrowed in the citizen's open sell orders.
 * - Free inventory goes first; the rest comes out of open sell orders (newest first), which reduces their remaining
 *   (market_open_orders subtracts escrow spoilage), so an order auto-shrinks and closes at 0.
 * - Idempotent per citizen, good and tick: a run only writes if no other run has spoiled that citizen's good on that tick.
 *   Every insert is guarded against the live view (free quantity / order remaining), so nothing goes negative.
 * - Only the latest tick is applied; days skipped by bounded catch-up are not back-charged.
 */
export async function runSpoilage(db: GameDatabase, tick: number, now: number) {
  if (!(tick > 0)) return;
  const run = `spoil:${tick}:${crypto.randomUUID()}:`;
  for (const good of Object.keys(shelfLifeDays) as PerishableGood[]) {
    const [held, escrow] = await Promise.all([
      db.prepare('SELECT clerk_user_id, quantity FROM citizen_inventory_balances WHERE item = ? AND quantity > 0').bind(good).all<{ clerk_user_id: string; quantity: number }>(),
      db.prepare(`SELECT id, citizen_id, remaining FROM market_open_orders WHERE side = 'sell' AND good = ? AND citizen_id IS NOT NULL
        ORDER BY created_at DESC, id DESC`).bind(good).all<{ id: string; citizen_id: string; remaining: number }>(),
    ]);
    const citizens = new Map<string, { free: number; orders: { id: string; remaining: number }[] }>();
    for (const r of held.results) citizens.set(r.clerk_user_id, { free: Number(r.quantity), orders: [] });
    for (const o of escrow.results) {
      const c = citizens.get(o.citizen_id) ?? { free: 0, orders: [] };
      c.orders.push({ id: o.id, remaining: Number(o.remaining) }); citizens.set(o.citizen_id, c);
    }
    for (const [citizen, c] of citizens) {
      const total = spoilQuantity(good, c.free + c.orders.reduce((s, o) => s + o.remaining, 0));
      if (!total) continue;
      const plan = allocateSpoilage(total, c.free, c.orders);
      const prefix = `${run}${citizen}:${good}:`;
      const notDone = `NOT EXISTS (SELECT 1 FROM market_spoilage x WHERE x.clerk_user_id = ? AND x.good = ? AND x.tick = ? AND NOT (x.id >= ? AND x.id < ?))`;
      // Rows from this run sort inside [prefix, prefix + DEL); any other row for this citizen/good/tick means another run already spoiled it.
      const gate = [citizen, good, tick, prefix, `${prefix}\u007f`];
      const statements = [];
      if (plan.free) statements.push(db.prepare(`INSERT OR IGNORE INTO market_spoilage (id, clerk_user_id, good, order_id, qty, tick, spoiled_at)
        SELECT ?, ?, ?, NULL, ?, ?, ? WHERE ${notDone}
        AND COALESCE((SELECT quantity FROM citizen_inventory_balances WHERE clerk_user_id = ? AND item = ?), 0) >= ?`)
        .bind(`${prefix}free`, citizen, good, plan.free, tick, now, ...gate, citizen, good, plan.free));
      for (const o of plan.orders) statements.push(db.prepare(`INSERT OR IGNORE INTO market_spoilage (id, clerk_user_id, good, order_id, qty, tick, spoiled_at)
        SELECT ?, ?, ?, ?, ?, ?, ? WHERE ${notDone}
        AND COALESCE((SELECT remaining FROM market_open_orders WHERE id = ? AND citizen_id = ?), 0) >= ?`)
        .bind(`${prefix}${o.id}`, citizen, good, o.id, o.qty, tick, now, ...gate, o.id, citizen, o.qty));
      await db.batch(statements);
    }
  }
}
