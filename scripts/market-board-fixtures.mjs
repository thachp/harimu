/** #200: order-book states for the board's UI checks. Shapes mirror readOrderBook() (lib/order-book.ts); tests/market-board.test.mjs
 *  compares them with the live route so they cannot drift. Used by the layout check and the screenshots. */
import { marketGoods } from '../lib/market-orders.ts';
const lvl = (unitMinor, qty, npc = false) => ({ unitMinor, qty, npc });
const depth = {
  fruit: { bids: [lvl(90, 12, true), lvl(85, 4), lvl(80, 20, true), lvl(75, 6), lvl(70, 30)], asks: [lvl(110, 8, true), lvl(115, 3), lvl(120, 25, true), lvl(130, 5), lvl(140, 40)], last: 100 },
  meat: { bids: [lvl(200, 3)], asks: [lvl(260, 2, true), lvl(275, 10)], last: 240 },
  wood: { bids: [], asks: [], last: null },
};
/** empty: no orders anywhere. orders: the viewer's open orders (id/side/good/qty/remaining/limit). */
export function bookState({ empty = false, orders = [], available = true } = {}) {
  return {
    available,
    goods: marketGoods.map(g => { const d = empty ? { bids: [], asks: [], last: null } : depth[g.good];
      return { good: g.good, label: g.label, unit: g.unit, perishable: g.perishable, bestBidMinor: d.bids[0]?.unitMinor ?? null, bestAskMinor: d.asks[0]?.unitMinor ?? null, bids: d.bids, asks: d.asks, lastTradeMinor: d.last }; }),
    myOrders: orders.map((o, i) => ({ id: o.id ?? `00000000-0000-4000-8000-00000000000${i}`, side: o.side, good: o.good, qty: o.qty, remaining: o.remaining ?? o.qty, limitUnitMinor: o.limit, createdAt: '2026-10-14T20:00:00.000Z' })),
  };
}
export const economyFixture = ({ walletMinor = 5000, fruit = 6, meat = 0, wood = 12 } = {}) => ({
  walletMinor, inventory: [{ item: 'fruit', quantity: fruit }, { item: 'meat', quantity: meat }, { item: 'wood', quantity: wood }].filter(i => i.quantity > 0),
  nextRecoveryAt: '2026-10-14T21:00:00.000Z', incomeTaxPercent: 0 });
