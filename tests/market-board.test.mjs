/** #200: the city market board, rendered from order-book states. Fixtures are compared with the live route so they cannot drift. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { localRuntime } from './helpers/local-runtime.mjs';
import { fileURLToPath } from 'node:url';
import { componentModule, loadApp } from './helpers/component-module.mjs';
import { bookState, economyFixture } from '../scripts/market-board-fixtures.mjs';
// The copy file re-exports a shared cap from './palace-coup-copy' (extensionless), so it is compiled like the components.
const { boardLabels, emptyStates, orderStateLines, escrowPreview, spoilageHints, rejections } = await import(await componentModule(fileURLToPath(new URL('../lib/market-board-copy.ts', import.meta.url))));

const { MarketBoard, parseOrderPrice, rejectionText, placementNotice, fillLine, spark } = await loadApp('market-board');
const noop = () => {};
const api = (book, extra = {}) => ({ book, busy: false, message: '', error: '', refresh: noop, place: noop, cancel: noop, ...extra });
const render = (book, economy = economyFixture(), extra = {}) => renderToStaticMarkup(React.createElement(MarketBoard, { api: api(book, extra), economy }));
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
const keys = o => Object.keys(o).sort();
const order = (o = {}) => ({ side: 'buy', good: 'fruit', qty: 5, limit: 100, ...o });

test('flag off or signed out: the board renders nothing', () => {
  assert.equal(render(null), '');
});

test('fixtures have the same shape as the live GET /api/market/orders, and the live state renders', async t => {
  const r = await localRuntime(); t.after(() => r.close()); r.setOrderBook(true);
  await r.call('citizen', 'alice');
  await r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES (?,?,'sell','fixture-cash',-1,?,1)").bind(randomUUID(), 'alice', 5000).run();
  const placed = await r.call('market/orders', 'alice', { action: 'market-order-place', requestId: randomUUID(), side: 'buy', good: 'fruit', qty: 2, limitUnitMinor: 50 });
  assert.equal(placed.status, 200);
  const live = (await r.call('market/orders', 'alice')).data;
  assert.equal(live.open, true);
  const fx = bookState({ orders: [order({ qty: 2, limit: 50 })] });
  assert.deepEqual(keys(fx), keys(live.book)); assert.deepEqual(keys(fx.goods[0]), keys(live.book.goods[0])); assert.deepEqual(keys(fx.myOrders[0]), keys(live.book.myOrders[0]));
  assert.deepEqual(fx.goods.map(g => g.good), live.book.goods.map(g => g.good)); assert.deepEqual(fx.goods.map(g => g.unit), live.book.goods.map(g => g.unit));
  assert.deepEqual(keys(fx.goods[0].bids[0]), keys({ unitMinor: 1, qty: 1, npc: false }));
  assert.match(text(render(live.book, economyFixture())), /Buy 2 Fruit at 0\.50 SPK each/);
});

test('each good shows best bid, best ask, last trade and five-level depth; NPC levels are marked; empty goods say so', () => {
  const t = text(render(bookState()));
  for (const label of [boardLabels.bestBid, boardLabels.bestAsk, boardLabels.lastTrade, boardLabels.depth]) assert.ok(t.includes(label), label);
  assert.match(t, /Fruit per basket/); assert.match(t, /Meat per cut/); assert.match(t, /Wood per bundle/);
  const html = render(bookState());
  assert.equal((html.match(new RegExp(boardLabels.npcTag, 'g')) ?? []).length, 5, 'one tag per NPC level (two fruit bids, two fruit asks, one meat ask)');
  assert.match(html, /<caption>Fruit bids<\/caption>/); assert.match(html, /<th scope="col">Price<\/th>/);
  assert.equal((html.match(/0\.90 SPK/g) ?? []).length, 2, 'best bid and the top bid level'); assert.ok(t.includes('1.00 SPK'), 'last trade');
  assert.ok(t.includes(emptyStates.noOrdersOnGood.text), 'wood has no orders');
  assert.equal(text(render(bookState({ empty: true }))).split(emptyStates.noOrdersOnGood.text).length - 1, 3);
});

test('spoilage hint only for fruit or meat the citizen holds, with the shelf life in game days', () => {
  let t = text(render(bookState(), economyFixture({ fruit: 6, meat: 0 })));
  assert.ok(t.includes(spoilageHints.fruit.text.replace('{days}', '3 game days'))); assert.ok(!t.includes('Meat spoils'));
  t = text(render(bookState(), economyFixture({ fruit: 0, meat: 2 }))); assert.ok(t.includes(spoilageHints.meat.text.replace('{days}', '2 game days'))); assert.ok(!t.includes('Fruit spoils'));
  assert.ok(!text(render(bookState(), economyFixture({ fruit: 0, meat: 0 }))).includes('spoils in'));
});

test('my open orders: open and partly filled states, a labelled Cancel for each, and an empty state', () => {
  const html = render(bookState({ orders: [order({ qty: 5 }), order({ side: 'sell', good: 'wood', qty: 10, remaining: 4, limit: 300 })] })), t = text(html);
  assert.ok(t.includes(boardLabels.myOpenOrders)); assert.ok(t.includes(orderStateLines.open.text)); assert.ok(t.includes('Partly filled: 6 of 10. The rest is still open.'));
  assert.match(t, /Sell 4 Wood at 3\.00 SPK each/);
  assert.match(html, /aria-label="Cancel order: buy 5 Fruit at 1\.00 SPK"/); assert.equal((html.match(/>Cancel order</g) ?? []).length, 2);
  assert.ok(text(render(bookState())).includes(emptyStates.noOpenOrders.text));
});

test('place-order form: escrow preview for buy and sell, labelled controls, plain reasons for a disabled submit', () => {
  const html = render(bookState()), t = text(html);
  assert.match(html, /<legend>Place order<\/legend>/); assert.match(html, /role="radiogroup" aria-label="Side"/); assert.ok(t.includes('Limit price (SPK each)'));
  assert.ok(t.includes(`${boardLabels.escrowPreview}.`)); assert.ok(t.includes('This order holds 1.00 SPK until it fills or you cancel it.'));
  assert.doesNotMatch(html, /disabled=""[^>]*>Place buy order/, 'a valid order is enabled');
  // Not enough Spark: the reason names the hold and the balance, and the button is disabled and described by it.
  const poor = render(bookState(), economyFixture({ walletMinor: 50 }));
  assert.match(poor, /<button[^>]*disabled=""[^>]*aria-describedby="[^"]+"[^>]*>Place buy order/); assert.ok(text(poor).includes('This order holds 1.00 SPK. You have 0.50 SPK available.'));
  // Busy and non-Kindle.
  assert.ok(text(render(bookState(), economyFixture(), { busy: true })).includes('Saving…'));
  assert.ok(text(render(bookState({ available: false }))).includes('Only Kindle citizens can trade on this board.'));
  // At the open-order cap.
  const full = bookState({ orders: Array.from({ length: 10 }, (_, i) => order({ limit: 100 + i })) });
  assert.ok(text(render(full)).includes('You have 10 open orders, the most allowed. Cancel one first.'));
});

test('price parsing follows the API limits', () => {
  assert.equal(parseOrderPrice('1'), 100); assert.equal(parseOrderPrice('0.01'), 1); assert.equal(parseOrderPrice('100'), 10000); assert.equal(parseOrderPrice('100.00'), 10000);
  for (const bad of ['0', '0.00', '100.01', '101', '1.234', '-1', 'abc', '', '1,5']) assert.equal(parseOrderPrice(bad), null, bad);
  assert.equal(spark(125), '1.25 SPK');
});

test('API rejections show Content\'s plain words, with the API limits filled in; unknown errors show the server message', () => {
  assert.equal(rejectionText(409, 'x', 'traveling'), rejections.find(r => r.key === 'traveling').line.text);
  assert.equal(rejectionText(403, 'The city order book is not open yet.', 'closed'), rejections.find(r => r.key === 'closed').line.text);
  assert.match(rejectionText(400, 'Send a requestId', 'bad_request'), /quantity up to 100 and a price up to 100\.00 SPK/);
  assert.match(rejectionText(409, 'Order refused: check Kindle citizenship, available Spark or goods for escrow, and the 10 open-order limit.'), /at most 10\)/);
  assert.equal(rejectionText(409, 'Order not open, already cancelled, or not yours.'), rejections.find(r => r.key === 'order_not_open').line.text);
  assert.equal(rejectionText(409, 'Request identifier already used for another intent.'), rejections.find(r => r.key === 'request_reused').line.text);
  assert.equal(rejectionText(401, 'Sign in required.'), rejections.find(r => r.key === 'unauthenticated').line.text);
  assert.equal(rejectionText(403, 'Same-origin request required.'), rejections.find(r => r.key === 'cross_origin').line.text);
  assert.equal(rejectionText(500, 'Something odd.'), 'Something odd.');
  assert.ok(!/\{\w+\}/.test(rejections.map(r => rejectionText(r.status, r.source, r.code ?? undefined)).join(' ')), 'no placeholder is left unfilled');
});

test('placement notices: traded in full, traded in part, or resting', () => {
  const before = bookState(), placed = { side: 'buy', good: 'fruit', qty: 5, limitUnitMinor: 100 };
  assert.equal(placementNotice(before, bookState(), placed), 'Your order traded 5 of 5 Fruit.');
  assert.equal(placementNotice(before, bookState({ orders: [order({ qty: 5, remaining: 2 })] }), placed), 'Your order traded 3 of 5 Fruit.');
  assert.equal(placementNotice(before, bookState({ orders: [order({ qty: 5 })] }), placed), orderStateLines.open.text);
  assert.equal(fillLine(escrowPreview.sell, { qty: 2, good: 'Wood' }), 'This order holds 2 Wood until it fills or you cancel it.');
});

test('status messages are announced politely and errors as alerts', () => {
  const html = render(bookState(), economyFixture(), { message: 'Order cancelled.', error: 'That order is no longer open. Refresh your open orders.' });
  assert.match(html, /aria-live="polite"[^>]*><p role="status">Order cancelled\./); assert.match(html, /<p role="alert">That order is no longer open/);
});

test('page wiring: the board is mounted once, only for signed-in Kindle citizens in the market view, and fixed-lot listings stay for open lots', async () => {
  const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /useOrderBook\(viewMode === 'market' && citizenNation\?\.id === 'kindle' && clerkConfigured && !guestActive\)/); assert.equal((page.match(/<MarketBoard /g) ?? []).length, 1);
  assert.match(page, /!orderBookApi\.book \|\| playerMarket\?\.listings\.some\(\(lot\) => lot\.mine && lot\.status === 'open'\)/);
});
