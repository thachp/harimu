/** #459: live-ticking Kindle market board behind HARIMU_MARKET_TICKER_ENABLED. Flag off: the GET carries no `ticker` key and the board starts no timer. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';
import { loadApp } from './helpers/component-module.mjs';
import { announceEveryMs, priceMoves, startTicker, tickAnnouncement, tickerIntervalMs, moveLabel } from '../lib/market-ticker.ts';

const g = (good, last, bid = null, ask = null) => ({ good, label: good[0].toUpperCase() + good.slice(1), bestBidMinor: bid, bestAskMinor: ask, lastTradeMinor: last });

test('flag off: GET /api/market/orders has no ticker key (so no polling); on: ticker true; never a write', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  r.setOrderBook(true);
  const off = await r.call('market/orders', 'alice');
  assert.equal(off.data.open, true); assert.equal('ticker' in off.data, false);
  r.setFixtureEnv('HARIMU_MARKET_TICKER_ENABLED', 'false');
  assert.equal('ticker' in (await r.call('market/orders', 'alice')).data, false);
  r.setFixtureEnv('HARIMU_MARKET_TICKER_ENABLED', 'true');
  assert.equal((await r.call('market/orders', 'alice')).data.ticker, true);
  const board = readFileSync('app/market-board.tsx', 'utf8');
  assert.match(board, /if \(!active \|\| !ticker\) return;\n\s+return startTicker\(/, 'the only timer starts behind the server key');
  assert.match(board, /setTicker\(data\.ticker === true\)/);
  assert.equal((board.match(/startTicker\(/g) ?? []).length, 1); assert.doesNotMatch(board, /setInterval|WebSocket|EventSource/);
});

test('interval is 20 s; polls while visible, pauses while hidden, resumes with one immediate load, stops on close', () => {
  assert.equal(tickerIntervalMs, 20_000);
  const listeners = new Set(), doc = { hidden: false, addEventListener: (_, f) => listeners.add(f), removeEventListener: (_, f) => listeners.delete(f) };
  let timers = new Map(), next = 1, loads = 0;
  const fake = { setInterval: (fn, ms) => { assert.equal(ms, 20_000); timers.set(next, fn); return next++; }, clearInterval: id => timers.delete(id) };
  const fire = () => [...timers.values()].forEach(f => f());
  const stop = startTicker(() => loads++, doc, fake);
  fire(); fire(); assert.equal(loads, 2, 'ticks while visible');
  doc.hidden = true; listeners.forEach(f => f()); assert.equal(timers.size, 0, 'paused when hidden'); fire(); assert.equal(loads, 2);
  doc.hidden = false; listeners.forEach(f => f()); assert.equal(loads, 3, 'one immediate load on return'); assert.equal(timers.size, 1);
  stop(); assert.equal(timers.size, 0); assert.equal(listeners.size, 0, 'board closed: timer and listener gone');
  doc.hidden = true; const s2 = startTicker(() => loads++, doc, fake); assert.equal(timers.size, 0, 'a board opened in a hidden tab does not poll'); s2();
});

test('direction markers: none on first load or no change; symbol + words for up and down', () => {
  assert.deepEqual(priceMoves(null, [g('fruit', 100)]), {}, 'first load');
  assert.deepEqual(priceMoves([g('fruit', 100, 90)], [g('fruit', 100, 90)]), {}, 'unchanged');
  assert.deepEqual(priceMoves([g('fruit', null)], [g('fruit', 100)]), {}, 'no previous trade');
  const m = priceMoves([g('fruit', 100, 90, 110), g('wood', 50)], [g('fruit', 102, 85, 110), g('wood', 50)]);
  assert.deepEqual(m, { fruit: { lastTradeMinor: { direction: 'up', deltaMinor: 2 }, bestBidMinor: { direction: 'down', deltaMinor: 5 } } });
  assert.equal(moveLabel(m.fruit.lastTradeMinor), '▲ up 0.02 SPK'); assert.equal(moveLabel(m.fruit.bestBidMinor), '▼ down 0.05 SPK');
});

test('rendered board: markers as text next to the value, "Updated" line, polite live region with the tick text', async () => {
  const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
  const { MarketBoard } = await loadApp('market-board');
  const good = { good: 'fruit', label: 'Fruit', unit: 'basket', perishable: true, bids: [], asks: [], bestBidMinor: 85, bestAskMinor: 110, lastTradeMinor: 102 };
  const api = { book: { available: true, goods: [good], myOrders: [] }, busy: false, message: '', error: '', refresh() {}, place() {}, cancel() {},
    ticker: true, moves: { fruit: { lastTradeMinor: { direction: 'up', deltaMinor: 2 } } }, updatedAt: Date.UTC(2026, 9, 21, 22, 5), tick: 'Market prices updated: Fruit last trade up 0.02 SPK.' };
  const html = renderToStaticMarkup(React.createElement(MarketBoard, { api, economy: null }));
  assert.match(html, /<div class="board-changed"><dt>Last trade<\/dt><dd>1\.02 SPK <span class="board-move board-move-up">▲ up 0\.02 SPK<\/span><\/dd><\/div>/);
  assert.match(html, /<div><dt>Best bid<\/dt><dd>0\.85 SPK<\/dd><\/div>/, 'unchanged value: no marker, no highlight');
  assert.match(html, /<p class="board-updated">Updated [^<]+<\/p>/);
  assert.match(html, /<div aria-live="polite" class="board-tick-live">Market prices updated: Fruit last trade up 0\.02 SPK\.<\/div>/);
  const off = renderToStaticMarkup(React.createElement(MarketBoard, { api: { ...api, ticker: false, moves: {}, updatedAt: null, tick: '' }, economy: null }));
  assert.doesNotMatch(off, /board-updated|board-tick-live|board-move/, 'flag off: board exactly as before');
});

test('live-region text: Last trade moves only, throttled to once a minute', () => {
  const goods = [g('fruit', 102), g('wood', 40)], moves = priceMoves([g('fruit', 100), g('wood', 45)], goods);
  assert.equal(tickAnnouncement(moves, goods, null, 1_000), 'Market prices updated: Fruit last trade up 0.02 SPK, Wood last trade down 0.05 SPK.');
  assert.equal(tickAnnouncement(moves, goods, 1_000, 1_000 + announceEveryMs - 1), null, 'throttled');
  assert.ok(tickAnnouncement(moves, goods, 1_000, 1_000 + announceEveryMs));
  assert.equal(tickAnnouncement(priceMoves([g('fruit', 100, 90)], [g('fruit', 100, 95)]), [g('fruit', 100, 95)], null, 0), null, 'bid-only change is not announced');
  assert.equal(tickAnnouncement({}, goods, null, 0), null);
});

test('reduced motion: the highlight animates only with motion allowed (OS and the game setting); markers are static text', () => {
  const css = readFileSync('app/game-shell.css', 'utf8');
  assert.match(css, /@media\(prefers-reduced-motion:no-preference\)\{html:not\(\[data-harimu-reduced-motion\]\) \.board-changed\{animation:board-tick 1\.2s ease-out 1\}\}/);
  assert.equal((css.match(/\.board-changed\{animation/g) ?? []).length, 1, 'no unguarded animation');
  assert.doesNotMatch(css.slice(css.indexOf('.board-move{'), css.indexOf('.board-move{') + 200), /animation|transition/);
});
