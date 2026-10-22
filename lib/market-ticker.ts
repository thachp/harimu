/** #459 (docs 23.2 "Money is the skin too: Spark prices tick live"): live-ticking Kindle market board. Pure and import-free.
 *  Behind HARIMU_MARKET_TICKER_ENABLED (preview "true", production "false"): `GET /api/market/orders` adds `ticker: true` only while it is on, and the board polls
 *  only when it sees that key, so flag off means no timer and no extra request. No new endpoint, no socket, and the GET stays read-only (#219).
 *  Interval: 20 s. Prices move only when someone places or cancels an order (no world tick on GET), so 20 s feels live without hammering the Worker:
 *  at most 3 reads a minute per open, visible board, inside the issue's 15 to 30 s range. */
export const tickerIntervalMs = 20_000;
/** The polite announcement fires at most once a minute, never on every tick, and only when a Last trade moved. */
export const announceEveryMs = 60_000;

type Price = number | null;
export type TickGood = { good: string; label: string; bestBidMinor: Price; bestAskMinor: Price; lastTradeMinor: Price };
export type TickField = 'bestBidMinor' | 'bestAskMinor' | 'lastTradeMinor';
export type Move = { direction: 'up' | 'down'; deltaMinor: number };
export type Moves = Record<string, Partial<Record<TickField, Move>>>;
const fields: readonly TickField[] = ['bestBidMinor', 'bestAskMinor', 'lastTradeMinor'];

/** Direction of each price against the previous fetch in this session. No previous fetch (first load), a missing value or no change: no marker. */
export function priceMoves(prev: readonly TickGood[] | null, next: readonly TickGood[]): Moves {
  const out: Moves = {};
  if (!prev) return out;
  for (const g of next) {
    const p = prev.find(x => x.good === g.good); if (!p) continue;
    for (const f of fields) {
      const a = p[f], b = g[f];
      if (a === null || b === null || a === b) continue;
      (out[g.good] ??= {})[f] = { direction: b > a ? 'up' : 'down', deltaMinor: Math.abs(b - a) };
    }
  }
  return out;
}

/** [PROPOSAL] copy for Content: the marker is a symbol plus words, never colour alone. */
export const tickerCopy = {
  up: { text: '▲ up {delta}', proposal: true },
  down: { text: '▼ down {delta}', proposal: true },
  updated: { text: 'Updated {time}', proposal: true },
  announce: { text: 'Market prices updated: {changes}.', proposal: true },
} as const;
const spk = (minor: number) => `${(minor / 100).toFixed(2)} SPK`;
export const moveLabel = (move: Move) => tickerCopy[move.direction].text.replace('{delta}', spk(move.deltaMinor));

/** The throttled polite text: Last trade moves only, or null when nothing should be said yet. */
export function tickAnnouncement(moves: Moves, goods: readonly TickGood[], lastAnnouncedAt: number | null, now: number): string | null {
  if (lastAnnouncedAt !== null && now - lastAnnouncedAt < announceEveryMs) return null;
  const changes = goods.flatMap(g => { const m = moves[g.good]?.lastTradeMinor; return m ? [`${g.label} last trade ${moveLabel(m).replace(/^[▲▼] /, '')}`] : []; });
  return changes.length ? tickerCopy.announce.text.replace('{changes}', changes.join(', ')) : null;
}

/** QA1 nit 1 on #705: Last trade moves seen inside the quiet window are kept (net per good) and said once the window ends, not dropped. */
type Clock = { setTimeout(fn: () => void, ms: number): unknown; clearTimeout(id: unknown): void };
export function tickAnnouncer(say: (text: string) => void, clock: Clock, windowMs = announceEveryMs) {
  let lastAt: number | null = null, timer: unknown = null;
  const pending = new Map<string, { label: string; net: number }>();
  const flush = (now: number) => {
    timer = null;
    const moves: Moves = {}, goods: TickGood[] = [];
    for (const [good, p] of pending) if (p.net) { moves[good] = { lastTradeMinor: { direction: p.net > 0 ? 'up' : 'down', deltaMinor: Math.abs(p.net) } }; goods.push({ good, label: p.label, bestBidMinor: null, bestAskMinor: null, lastTradeMinor: null }); }
    pending.clear();
    const text = tickAnnouncement(moves, goods, null, now);
    if (text) { lastAt = now; say(text); }
  };
  return {
    offer(moves: Moves, goods: readonly TickGood[], now: number) {
      for (const g of goods) { const m = moves[g.good]?.lastTradeMinor; if (!m) continue; const p = pending.get(g.good) ?? { label: g.label, net: 0 }; p.net += m.direction === 'up' ? m.deltaMinor : -m.deltaMinor; pending.set(g.good, p); }
      if (!pending.size || timer !== null) return;
      if (lastAt === null || now - lastAt >= windowMs) flush(now);
      else { const at = lastAt + windowMs; timer = clock.setTimeout(() => flush(at), at - now); }
    },
    /** QA1 on #706: drops the deferred announcement and anything pending, so nothing is said after the tab hides, the flag turns off or the board unmounts. */
    stop() { if (timer !== null) clock.clearTimeout(timer); timer = null; pending.clear(); },
  };
}

/** QA1 nit 2 on #705: screen readers skip an unchanged live region, so a repeat of the same text alternates a zero-width space suffix. */
export const freshLiveText = (prev: string, next: string) => (prev === next ? `${next}\u200B` : next);

type Doc = { hidden: boolean; addEventListener(type: 'visibilitychange', fn: () => void): void; removeEventListener(type: 'visibilitychange', fn: () => void): void };
type Timers = { setInterval(fn: () => void, ms: number): unknown; clearInterval(id: unknown): void };
/** Polls `load` every interval while the document is visible; pauses when hidden and resumes (with one immediate load) when visible again. Returns stop(). */
export function startTicker(load: () => void, doc: Doc, timers: Timers, intervalMs = tickerIntervalMs): () => void {
  let id: unknown = null;
  const run = () => { if (id === null && !doc.hidden) id = timers.setInterval(() => { if (!doc.hidden) load(); }, intervalMs); };
  const halt = () => { if (id !== null) { timers.clearInterval(id); id = null; } };
  const onVisibility = () => { if (doc.hidden) halt(); else { load(); run(); } };
  doc.addEventListener('visibilitychange', onVisibility); run();
  return () => { halt(); doc.removeEventListener('visibilitychange', onVisibility); };
}
