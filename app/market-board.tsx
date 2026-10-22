'use client';
/** #200: the Kindle city market board (order book of #197) with Content's board copy (lib/market-board-copy.ts, #331).
 *  Off with the API: while HARIMU_ORDER_BOOK_ENABLED is false, `GET /api/market/orders` answers `{ open: false }` and nothing renders.
 *  All wording that states a rule (labels, order states, escrow, spoilage, rejections) comes from the copy file; this file only
 *  fills its placeholders from the API's own state and limits. */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Economy } from '@/lib/economy';
import { orderBookLimits, type OrderBookState } from '@/lib/order-book-rules';
import { shelfLifeDays } from '@/lib/spoilage-rules';
import { boardLabels, cancelConfirmation, emptyStates, escrowPreview, fillNotice, orderStateLines, rejectionFor, rejectionForReason, rejections, spoilageHints, type Line, type RejectionKey } from '@/lib/market-board-copy';
import { ActionButton } from './action-button';
import { freshLiveText, moveLabel, priceMoves, startTicker, tickAnnouncer, tickerCopy, type Moves } from '@/lib/market-ticker';
import { useDisplayTimestamp } from './display-preferences';

type Good = OrderBookState['goods'][number];
type Order = OrderBookState['myOrders'][number];
type Placement = { side: 'buy' | 'sell'; good: string; qty: number; limitUnitMinor: number };

export const spark = (minor: number) => `${(minor / 100).toFixed(2)} SPK`;
/** Fills a copy line's {placeholders}. Unknown placeholders are left alone so a copy change is visible, never silently dropped. */
export const fillLine = (line: Line | string, vars: Record<string, string | number>) => (typeof line === 'string' ? line : line.text).replace(/\{(\w+)\}/g, (m, k) => k in vars ? String(vars[k]) : m);
const limitVars = { maxQty: orderBookLimits.maxQty, maxPrice: spark(orderBookLimits.maxUnitMinor), maxOrders: orderBookLimits.maxOpenOrders };
/** "1.25" → 125. Whole Spark or up to two decimals, 0.01 to the API's price cap. */
export function parseOrderPrice(value: string): number | null {
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, cents = ''] = value.trim().split('.'); const minor = Number(whole) * 100 + Number(cents.padEnd(2, '0'));
  return minor >= 1 && minor <= orderBookLimits.maxUnitMinor ? minor : null;
}
/** Maps an order API error to one of Content's rejection lines (by `reason` code, then by the API message), else the server's own words. */
export function rejectionText(status: number, error: string | undefined, reason: string | undefined) {
  const hit = (reason ? rejectionForReason(reason) : undefined) ?? (error ? rejections.find(r => r.code === null && error.includes(r.source)) : undefined)
    ?? (status === 401 ? rejectionFor('unauthenticated' satisfies RejectionKey) : undefined);
  return hit ? fillLine(hit.line, limitVars) : error ?? 'That did not work. Try again.';
}
/** What happened to a just-placed order, from the board before and after: traded fully, partly, or resting. */
export function placementNotice(before: OrderBookState | null, after: OrderBookState, placed: Placement) {
  const known = new Set((before?.myOrders ?? []).map(o => o.id));
  const fresh = after.myOrders.find(o => !known.has(o.id) && o.side === placed.side && o.good === placed.good && o.qty === placed.qty && o.limitUnitMinor === placed.limitUnitMinor);
  const filled = fresh ? placed.qty - fresh.remaining : placed.qty;
  const label = after.goods.find(g => g.good === placed.good)?.label ?? placed.good;
  return fillLine(filled > 0 ? fillNotice : orderStateLines.open, { filled, qty: placed.qty, good: label });
}

/** One fetch for the board and the commands that change it. A retry of the same command reuses its requestId. */
type BookResponse = { open?: boolean; book?: OrderBookState; ticker?: boolean };
/** One fetch-and-parse path for the board's GET, shared by mount and ticks (QA1 nit 4 on #705). Null when signed out, unavailable or aborted. */
async function fetchBook(signal?: AbortSignal): Promise<BookResponse | null> {
  try {
    const r = await fetch('/api/market/orders', { cache: 'no-store', signal });
    return r.ok ? await r.json() as BookResponse : null;
  } catch { return null; }
}

export function useOrderBook(active: boolean) {
  const [book, setBook] = useState<OrderBookState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const intent = useRef<{ key: string; requestId: string } | null>(null);
  const latest = useRef<OrderBookState | null>(null);
  const [ticker, setTicker] = useState(false); // #459: true only when the GET says so (HARIMU_MARKET_TICKER_ENABLED)
  const [moves, setMoves] = useState<Moves>({});
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [tick, setTick] = useState('');
  const [announcer] = useState(() => tickAnnouncer(text => setTick(prev => freshLiveText(prev, text)), { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: id => clearTimeout(id as ReturnType<typeof setTimeout>) }));
  useEffect(() => () => announcer.stop(), [announcer]);
  const accept = useCallback((next: OrderBookState, live: boolean) => {
    const found = priceMoves(latest.current?.goods ?? null, next.goods), now = Date.now();
    setMoves(found); setUpdatedAt(now);
    if (live) announcer.offer(found, next.goods, now);
    setBook(next);
  }, [announcer]);
  useEffect(() => { latest.current = book; }, [book]);
  const apply = useCallback((data: BookResponse | null, first: boolean) => {
    if (data?.open && data.book) { setTicker(data.ticker === true); accept(data.book, !first && data.ticker === true); }
  }, [accept]);
  const load = useCallback(() => fetchBook().then(data => apply(data, false)), [apply]);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    void fetchBook(controller.signal).then(data => apply(data, true)); // state is set in the callback, not the effect body
    return () => controller.abort();
  }, [active, apply]);
  useEffect(() => { // #459: poll only while the board is open and the server turned the ticker on; paused while the tab is hidden
    if (!active || !ticker) { announcer.stop(); return; } // flag off or board closed: cancel any deferred announcement
    const stopTicker = startTicker(() => void load(), document, window);
    const onVisibility = () => { if (document.hidden) announcer.stop(); }; // hidden tab: never announce later
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stopTicker(); document.removeEventListener('visibilitychange', onVisibility); announcer.stop(); };
  }, [active, ticker, load, announcer]);
  async function post(body: Record<string, unknown>, success: (after: OrderBookState, before: OrderBookState | null) => string) {
    if (busy) return;
    const key = JSON.stringify(body);
    const requestId = intent.current?.key === key ? intent.current.requestId : crypto.randomUUID();
    intent.current = { key, requestId }; setBusy(true); setError(''); setMessage('');
    try {
      const r = await fetch('/api/market/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, requestId }) });
      const data = await r.json().catch(() => ({})) as { error?: string; reason?: string; book?: OrderBookState };
      const before = latest.current;
      if (data.book) setBook(data.book);
      if (!r.ok) { if (r.status < 500) intent.current = null; throw new Error(rejectionText(r.status, data.error, data.reason)); }
      intent.current = null;
      if (data.book) setMessage(success(data.book, before));
    } catch (e) { setError(e instanceof Error && e.message ? e.message : 'Connection interrupted. Retry to confirm the saved result.'); }
    finally { setBusy(false); }
  }
  return {
    book: active ? book : null, busy, message, error, refresh: () => load(), ticker, moves, updatedAt, tick,
    place: (p: Placement) => post({ action: 'market-order-place', ...p }, (after, before) => placementNotice(before, after, p)),
    cancel: (orderId: string) => post({ action: 'market-order-cancel', orderId }, () => fillLine(cancelConfirmation, {})),
  };
}
export type OrderBookApi = ReturnType<typeof useOrderBook>;

function Levels({ good, side, levels }: { good: Good; side: 'Bids' | 'Asks'; levels: Good['bids'] }) {
  return <table className="board-levels"><caption>{good.label} {side.toLowerCase()}</caption>
    <thead><tr><th scope="col">Price</th><th scope="col">Qty</th></tr></thead>
    <tbody>{levels.map(l => <tr key={l.unitMinor}><td>{spark(l.unitMinor)}</td><td>{l.qty}{l.npc && <> <span className="board-npc">{boardLabels.npcTag}</span></>}</td></tr>)}</tbody></table>;
}

function Stat({ label, minor, move }: { label: string; minor: number | null; move?: Moves[string]['lastTradeMinor'] }) {
  return <div className={move ? 'board-changed' : undefined}><dt>{label}</dt><dd>{minor === null ? '—' : spark(minor)}{move && <> <span className={`board-move board-move-${move.direction}`}>{moveLabel(move)}</span></>}</dd></div>;
}

function GoodCard({ good, held, moves }: { good: Good; held: number; moves?: Moves[string] }) {
  const empty = !good.bids.length && !good.asks.length;
  const hint = good.perishable && held > 0 ? spoilageHints[good.good as 'fruit' | 'meat'] : null;
  return <article className="board-good" aria-labelledby={`board-${good.good}`}>
    <h4 id={`board-${good.good}`}>{good.label} <small>per {good.unit}</small></h4>
    <dl className="board-stats">
      <Stat label={boardLabels.bestBid} minor={good.bestBidMinor} move={moves?.bestBidMinor} />
      <Stat label={boardLabels.bestAsk} minor={good.bestAskMinor} move={moves?.bestAskMinor} />
      <Stat label={boardLabels.lastTrade} minor={good.lastTradeMinor} move={moves?.lastTradeMinor} />
    </dl>
    {hint && <p className="board-spoil">{fillLine(hint, { days: `${shelfLifeDays[good.good as 'fruit' | 'meat']} game days` })}</p>}
    {empty ? <p className="board-note">{emptyStates.noOrdersOnGood.text}</p> : <>
      <h5>{boardLabels.depth}</h5>
      <div className="board-depth"><Levels good={good} side="Bids" levels={good.bids} /><Levels good={good} side="Asks" levels={good.asks} /></div></>}
  </article>;
}

function OrderRow({ order, goods, reason, onCancel }: { order: Order; goods: Good[]; reason: string | null; onCancel: () => void }) {
  const g = goods.find(x => x.good === order.good); const label = g?.label ?? order.good;
  const partly = order.remaining < order.qty;
  const state = partly ? orderStateLines['partly-filled'] : orderStateLines.open;
  return <li className="board-order">
    <span><strong>{order.side === 'buy' ? 'Buy' : 'Sell'} {order.remaining} {label}</strong> at {spark(order.limitUnitMinor)} each</span>
    <small>{fillLine(state, { filled: order.qty - order.remaining, qty: order.qty, good: label })}</small>
    <ActionButton type="button" reason={reason} onClick={onCancel} aria-label={`Cancel order: ${order.side} ${order.remaining} ${label} at ${spark(order.limitUnitMinor)}`}>Cancel order</ActionButton>
  </li>;
}

export function MarketBoard({ api, economy }: { api: OrderBookApi; economy: Economy | null }) {
  const { book, busy, message, error } = api;
  const stamp = useDisplayTimestamp();
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [good, setGood] = useState('fruit');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('1.00');
  if (!book) return null;
  const goods = book.goods, info = goods.find(g => g.good === good) ?? goods[0];
  const held = (item: string) => economy?.inventory.find(e => e.item === item)?.quantity ?? 0;
  const q = /^\d{1,4}$/.test(qty) ? Number(qty) : NaN, minor = parseOrderPrice(price);
  const valid = Number.isSafeInteger(q) && q >= 1 && q <= orderBookLimits.maxQty && minor !== null;
  const cost = valid ? q * minor : 0, wallet = economy?.walletMinor ?? 0;
  const reason = busy ? 'Saving…'
    : !book.available ? 'Only Kindle citizens can trade on this board.'
    : !valid ? fillLine(rejectionFor('bad_request')!.line, limitVars)
    : book.myOrders.length >= orderBookLimits.maxOpenOrders ? `You have ${orderBookLimits.maxOpenOrders} open orders, the most allowed. Cancel one first.`
    : side === 'buy' && cost > wallet ? `This order holds ${spark(cost)}. You have ${spark(wallet)} available.`
    : side === 'sell' && q > held(info.good) ? `You have ${held(info.good)} ${info.label} available. This order holds ${q}.` : null;
  const preview = valid ? fillLine(side === 'buy' ? escrowPreview.buy : escrowPreview.sell, { cost: spark(cost), qty: q, good: info.label }) : null;
  return <section className="market-board" aria-labelledby="market-board-heading">
    <div className="board-heading"><h3 id="market-board-heading">City market board</h3>
      <ActionButton type="button" reason={busy ? 'Saving…' : null} onClick={() => void api.refresh()}>Refresh board</ActionButton></div>
    <p className="board-note">Kindle · fruit, meat and wood. Prices are in Spark per {goods.map(g => g.unit).join(', ').replace(/, ([^,]*)$/, ' or $1')}. Buys hold Spark and sells hold goods until they trade or you cancel.</p>
    <div className="board-goods">{goods.map(g => <GoodCard key={g.good} good={g} held={held(g.good)} moves={api.moves?.[g.good]} />)}</div>
    {api.ticker && api.updatedAt !== null && <p className="board-updated">{tickerCopy.updated.text.replace('{time}', stamp(api.updatedAt))}</p>}
    {api.ticker && <div aria-live="polite" className="board-tick-live">{api.tick}</div>}

    <h4>{boardLabels.myOpenOrders}</h4>
    {book.myOrders.length ? <ul className="board-orders">{book.myOrders.map(o => <OrderRow key={o.id} order={o} goods={goods} reason={busy ? 'Saving…' : null} onCancel={() => void api.cancel(o.id)} />)}</ul>
      : <p className="board-note">{emptyStates.noOpenOrders.text}</p>}

    <form className="board-form" onSubmit={e => { e.preventDefault(); if (!reason && valid) void api.place({ side, good: info.good, qty: q, limitUnitMinor: minor! }); }}>
      <fieldset disabled={busy}><legend>{boardLabels.placeOrder}</legend>
        <div role="radiogroup" aria-label="Side" className="board-side">
          {(['buy', 'sell'] as const).map(s => <label key={s}><input type="radio" name="board-side" value={s} checked={side === s} onChange={() => setSide(s)} /> {s === 'buy' ? 'Buy' : 'Sell'}</label>)}
        </div>
        <label>Good <select value={info.good} onChange={e => setGood(e.target.value)}>{goods.map(g => <option key={g.good} value={g.good}>{g.label}</option>)}</select></label>
        <label>Quantity <input inputMode="numeric" value={qty} onChange={e => setQty(e.target.value)} aria-describedby="board-limits" /></label>
        <label>Limit price (SPK each) <input inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} aria-describedby="board-limits" /></label>
        <small id="board-limits">{held(info.good)} {info.label} and {spark(wallet)} available · up to {orderBookLimits.maxQty} per order · up to {spark(orderBookLimits.maxUnitMinor)} each · at most {orderBookLimits.maxOpenOrders} open orders</small>
        {preview && <p className="board-escrow" role="status"><strong>{boardLabels.escrowPreview}.</strong> {preview}</p>}
        <ActionButton type="submit" reason={reason}>{side === 'buy' ? 'Place buy order' : 'Place sell order'}</ActionButton>
      </fieldset>
    </form>
    <div aria-live="polite" className="board-status">{message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}</div>
  </section>;
}
