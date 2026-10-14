/** #197 pure rules (no runtime imports, so tests can load them directly). Goods mirror lib/market-orders marketGoods. */
export type MarketGood = 'fruit' | 'meat' | 'wood';
export const orderBookGoods: readonly MarketGood[] = ['fruit', 'meat', 'wood'];
const isMarketGood = (v: unknown): v is MarketGood => orderBookGoods.includes(v as MarketGood);
export const orderBookCityId = 'kindle';
export const orderBookLimits = { maxQty: 100, maxUnitMinor: 10000, maxOpenOrders: 10, matchRounds: 4 } as const;
export type OrderCommand =
  | { action: 'market-order-place'; requestId: string; side: 'buy' | 'sell'; good: MarketGood; qty: number; limitUnitMinor: number }
  | { action: 'market-order-cancel'; requestId: string; orderId: string };
export type OrderBookState = {
  available: boolean;
  goods: { good: MarketGood; label: string; unit: string; perishable: boolean; bestBidMinor: number | null; bestAskMinor: number | null;
    bids: { unitMinor: number; qty: number; npc: boolean }[]; asks: { unitMinor: number; qty: number; npc: boolean }[]; lastTradeMinor: number | null }[];
  myOrders: { id: string; side: 'buy' | 'sell'; good: MarketGood; qty: number; remaining: number; limitUnitMinor: number; createdAt: string }[];
};
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const int = (v: unknown, max: number) => Number.isSafeInteger(v) && (v as number) >= 1 && (v as number) <= max;

export function validOrderCommand(body: Record<string, unknown>): body is Record<string, unknown> & OrderCommand {
  if (!uuid(body.requestId)) return false;
  if (body.action === 'market-order-place') return (body.side === 'buy' || body.side === 'sell') && isMarketGood(body.good)
    && int(body.qty, orderBookLimits.maxQty) && int(body.limitUnitMinor, orderBookLimits.maxUnitMinor);
  return body.action === 'market-order-cancel' && uuid(body.orderId);
}

export type RestingOrder = { id: string; citizen_id: string | null; side: 'buy' | 'sell'; limit_unit_minor: number; remaining: number; created_at: number };
export type Fill = { restingId: string; qty: number; unitMinor: number };
/** Pure price-time matching for an incoming order against resting orders (any order, any side). */
export function matchOrder(incoming: { side: 'buy' | 'sell'; limitUnitMinor: number; remaining: number; citizenId: string | null }, book: RestingOrder[]): Fill[] {
  const opposite = book.filter(o => o.side !== incoming.side && o.remaining > 0 && !(incoming.citizenId && o.citizen_id === incoming.citizenId)
    && (incoming.side === 'buy' ? o.limit_unit_minor <= incoming.limitUnitMinor : o.limit_unit_minor >= incoming.limitUnitMinor));
  opposite.sort((a, b) => (incoming.side === 'buy' ? a.limit_unit_minor - b.limit_unit_minor : b.limit_unit_minor - a.limit_unit_minor)
    || a.created_at - b.created_at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const fills: Fill[] = []; let left = incoming.remaining;
  for (const o of opposite) { if (left <= 0) break; const qty = Math.min(left, o.remaining); fills.push({ restingId: o.id, qty, unitMinor: o.limit_unit_minor }); left -= qty; }
  return fills;
}

