/** #199 spoilage: pure rules (no runtime imports, so tests load them directly). */
export type PerishableGood = 'fruit' | 'meat';
/** Shelf life in game days; mirrors lib/market-orders marketGoods (a test pins parity). Wood never spoils. */
export const shelfLifeDays: Record<PerishableGood, number> = { fruit: 3, meat: 2 };
/** Units lost per game day: ceil(held / shelf life), so any stack is gone within roughly its shelf life
 *  (3 fruit last 3 days; 2 meat last 2 days) and a single unit is never stuck forever. Never more than held. */
export function spoilQuantity(good: PerishableGood, held: number): number {
  const n = Math.max(0, Math.floor(held));
  return n === 0 ? 0 : Math.min(n, Math.ceil(n / shelfLifeDays[good]));
}
/** Split the day's loss: free inventory first, then open sell orders (newest first, so the oldest keep their place). */
export function allocateSpoilage(total: number, free: number, orders: { id: string; remaining: number }[]): { free: number; orders: { id: string; qty: number }[] } {
  let left = total; const fromFree = Math.min(Math.max(0, free), left); left -= fromFree;
  const out: { id: string; qty: number }[] = [];
  for (const o of orders) { if (left <= 0) break; const q = Math.min(o.remaining, left); if (q > 0) { out.push({ id: o.id, qty: q }); left -= q; } }
  return { free: fromFree, orders: out };
}
