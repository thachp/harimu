/** #344: with the market flag (HARIMU_ORDER_BOOK_ENABLED) off, no Market entry point is shown: location tab, city map building,
 *  first-week market goals ("Sell something", "Go to Market") and the "take your earnings to market" prompts. Flag on changes nothing. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { localRuntime } from './helpers/local-runtime.mjs';
import { loadApp } from './helpers/component-module.mjs';
import { marketVisible, locationVisible, marketFlagOn } from '../lib/market-visibility.ts';
import { createCityWorld } from '../lib/game-art.ts';
import { firstWeekArcs, firstWeekDay, visibleGoals, withoutMarketGoals } from '../lib/first-week.ts';
import { firstWeekTracker } from '../lib/first-week-progress.ts';

const enrolledAt = '2026-10-01T12:00:00.000Z', dayMs = 86400000, t0 = Date.parse(enrolledAt);
const arcDay = (nationId, n, flag) => {
  const day = firstWeekDay({ nationId, enrolledAt, now: t0 + (n - 1) * dayMs + 60000 });
  return withoutMarketGoals(day && { ...day, goals: visibleGoals(day) }, marketVisible(nationId, flag));
};
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('visibility rule: flag off hides the Market for Kindle-style citizens; Korund and Aurelle stores are separate systems', () => {
  assert.equal(marketFlagOn('true'), true);
  for (const v of [undefined, null, '', 'false', 'TRUE', '1', true]) assert.equal(marketFlagOn(v), v === true ? false : false, `fails closed for ${String(v)}`);
  assert.equal(marketVisible('kindle', false), false);
  assert.equal(marketVisible(undefined, false), false);
  assert.equal(marketVisible('kindle', true), true);
  assert.equal(marketVisible('korund', false), true);
  assert.equal(marketVisible('aurelle', false), true);
  assert.equal(locationVisible('market', 'kindle', false), false);
  for (const id of ['world', 'country', 'square', 'household', 'workplace', 'government']) assert.equal(locationVisible(id, 'kindle', false), true, id);
  assert.equal(locationVisible('market', 'kindle', true), true);
});

test('the city map has no "Forgehaven market" building with the flag off, and everything else stays put', () => {
  const on = createCityWorld('kindle');
  const off = createCityWorld('kindle', undefined, { marketOpen: false });
  assert.ok(on.buildings.some(b => b.label === 'Forgehaven market'));
  assert.ok(!off.buildings.some(b => b.location === 'market' || /market/i.test(b.label)));
  assert.deepEqual(off.buildings.map(b => [b.location, b.label, b.position.toArray()]), on.buildings.filter(b => b.location !== 'market').map(b => [b.location, b.label, b.position.toArray()]));
  assert.ok(!createCityWorld('kindle', 'Tarrek Foundry', { marketOpen: false }).buildings.some(b => /market/i.test(b.label)));
  assert.equal(createCityWorld('korund', undefined, { marketOpen: true }).buildings.find(b => b.location === 'market').label, 'State ration store');
});

test('first-week tracker: market goals are hidden (not "Not tracked yet") and the days still complete', async () => {
  const { FirstWeekTracker } = await loadApp('first-week-tracker');
  for (const n of [2, 6]) {
    const on = firstWeekTracker({ day: arcDay('kindle', n, true), done: [] });
    const off = firstWeekTracker({ day: arcDay('kindle', n, false), done: [] });
    assert.ok(on.goals.some(g => g.goal.screen === 'market'), `day ${n} has a market goal with the flag on`);
    assert.ok(off.goals.length > 0 && off.goals.every(g => g.goal.screen !== 'market'), `day ${n}`);
    const html = text(renderToStaticMarkup(React.createElement(FirstWeekTracker, { tracker: off, onNavigate() {} })));
    assert.doesNotMatch(html, /Sell something|Go to Market|Market|earnings to market/i, `day ${n}: ${html}`);
  }
  // Can still complete: once the shift goals are done there is nothing left that needs the Market.
  const day2 = firstWeekTracker({ day: arcDay('kindle', 2, false), done: ['kindle-2-shift'], signals: { shifts: [{ orderName: 'Harvest', claimedAt: new Date(t0 + 30 * 60000).toISOString() }, { orderName: 'Harvest', claimedAt: new Date(t0 + dayMs + 1000).toISOString() }], dayStart: t0 + dayMs } });
  assert.equal(day2.doneCount, day2.goals.length, 'every remaining goal can be completed');
  // Flag on: unchanged.
  assert.deepEqual(arcDay('kindle', 2, true), firstWeekDay({ nationId: 'kindle', enrolledAt, now: t0 + dayMs + 60000 }));
  // Other nations' stores are not the flagged market.
  for (const nationId of ['korund', 'aurelle']) {
    const arc = firstWeekArcs.find(a => a.nationId === nationId);
    for (const d of arc.days) assert.deepEqual(arcDay(nationId, d.day, false)?.goals.map(g => g.id), visibleGoals(d).map(g => g.id), `${nationId} day ${d.day}`);
  }
  // A day made only of market goals disappears rather than showing an empty tracker.
  assert.equal(firstWeekTracker({ day: withoutMarketGoals({ day: 2, theme: 't', goals: [firstWeekArcs[0].days[0].goals[1]] }, false), done: [] }), null);
});

test('the citizen API reports the market flag, off by default, on when HARIMU_ORDER_BOOK_ENABLED is true', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  assert.deepEqual((await r.call('citizen', 'alice')).data.flags, { market: false });
  r.setOrderBook(true);
  assert.deepEqual((await r.call('citizen', 'alice')).data.flags, { market: true });
  r.setOrderBook(false);
  assert.deepEqual((await r.call('citizen', 'alice')).data.flags, { market: false });
});

test('the page, shell and daily loop use the flag: tab, link, prompts and navigation', async () => {
  const [page, shell, loop] = await Promise.all(['page', 'game-shell', 'daily-loop'].map(n => readFile(new URL(`../app/${n}.tsx`, import.meta.url), 'utf8')));
  assert.match(page, /const \[marketFlag, setMarketFlag\] = useState\(false\)/, 'fails closed until the server says otherwise');
  assert.match(page, /snapshot\.flags\.market === true/);
  assert.match(page, /\{marketShown && <button type="button" onClick=\{\(\) => changeView\('market'\)\}>Take your earnings to market<\/button>\}/);
  assert.match(page, /requestedView === 'market' && !marketShown \? 'square'/, 'no navigation reaches the Market scene');
  assert.match(page, /viewMode === 'market' && marketShown && !\['korund','aurelle'\]/);
  assert.match(page, /\.\.\.\(marketShown \? \[\{ id: 'market'/, 'city square destinations');
  assert.match(page, /marketOpen=\{marketShown\}/, 'the DailyLoop prop (the GameShell tag is checked separately below)');
  assert.match(shell, /places\.filter\(\(\{id\}\) => locationVisible\(id, resourceNation\.id, marketOpen\)\)/, 'location dock');
  assert.match(shell, /<GameViewport marketOpen=\{marketVisible\(resourceNation\.id, marketOpen\)\}/, 'map building');
  assert.match(loop, /marketOpen \? 'Collect the agreed reward once, then take your earnings to market\.' : 'Collect the agreed reward once\.'/);
  assert.match(loop, /const buyHere = view === 'market' \|\| !marketOpen/);
  assert.match(loop, /const canBuy = Boolean\(market\?\.available/, 'same stock and wallet checks as before');
});

test('#19 instant city travel with the TRAVEL flag off: in-nation only, and unreachable with it on (finding for the PR)', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  r.setTravel(false);
  await r.call('citizen', 'alice');
  const home = await r.call('city', 'alice');
  assert.equal(home.status, 200);
  // Off: the shipped #19 path is the live one, free and instant, within the citizen's own nation only.
  const inNation = await r.call('city', 'alice', { action: 'travel', cityId: 'kolt-savanna' });
  assert.equal(inNation.status, 200); assert.equal(inNation.data.timed, undefined); assert.equal(inNation.data.currentCityId, 'kolt-savanna');
  const otherNation = await r.call('city', 'alice', { action: 'travel', cityId: 'gren-plateau' });
  assert.equal(otherNation.status, 400, 'no cross-nation instant travel');
  // On: the instant path is not reachable; travel becomes a timed journey.
  r.setTravel(true);
  const timed = await r.call('city', 'alice', { action: 'travel', cityId: 'ashby-crossing' });
  assert.notEqual(timed.data.currentCityId, 'ashby-crossing');
});

// --- Food is not stranded: with the flag off the daily-loop food step buys in place (ARC on #364). ---
const require = createRequire(import.meta.url);
const loopSource = await readFile(new URL('../app/daily-loop.tsx', import.meta.url), 'utf8');
const loopCompiled = ts.transpileModule(loopSource, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
function dailyLoop(flags) {
  const navigated = [], bought = [], exports = {};
  new Function('exports', 'require', loopCompiled)(exports, name => name === './display-preferences' ? { useDisplayTimestamp: () => require('../lib/display-preferences.ts').displayTimestamp } : name === './game-timer' ? { GameTimer: () => null } : name === 'react' ? { useState: () => [Date.parse('2026-10-13T20:00:00Z'), () => {}], useEffect() {} } : name === './daily-loop-choice' ? require('../app/daily-loop-choice.ts') : require(name));
  const tree = exports.DailyLoop({ nationName: 'Kindle', supported: true, localDemo: false, view: 'household', economy: { inventory: [], walletMinor: 1000 },
    market: { available: true, mealFood: 2, mealCapacity: 12, mealReadyAt: null, quotes: [{ item: 'food', buyMinor: 100, stock: 50 }] },
    shifts: [{ id: 's1', orderName: 'Harvest', startedAt: '2026-10-13T10:00:00Z', completesAt: '2026-10-13T12:00:00Z', claimedAt: '2026-10-13T12:05:00Z' }],
    capacity: 10, jobs: [{ id: 'harvest', name: 'Harvest', cost: 6 }], busy: false, uncertain: false, ...flags,
    onNavigate: view => navigated.push(view), onStart() {}, onClaim() {}, onRefresh() {}, onBuyFood: quantity => bought.push(quantity), onMeal() {} });
  const all = node => [node, ...[node?.props?.children].flat(Infinity).filter(Boolean).flatMap(child => typeof child === 'object' ? all(child) : [child])];
  const nodes = all(tree);
  return { navigated, bought, button: label => nodes.find(node => node?.type === 'button' && node.props.children === label), texts: nodes.filter(n => typeof n === 'string') };
}
test('flag off: the daily-loop food step is "Buy {n} food" and buys in place from any view, with no Market navigation', () => {
  const off = dailyLoop({ marketOpen: false });
  assert.equal(off.button('Open food market'), undefined);
  assert.ok(off.button('Buy 2 food'), off.texts.join('|'));
  off.button('Buy 2 food').props.onClick();
  assert.deepEqual(off.bought, [2]); assert.deepEqual(off.navigated, [], 'never navigates to the Market');
  assert.ok(!off.texts.some(t => /earnings to market/.test(t)));
  // The same checks as before still gate the step: no stock or too little Spark means no buy step.
  assert.equal(dailyLoop({ marketOpen: false, economy: { inventory: [], walletMinor: 50 } }).button('Buy 2 food'), undefined);
  assert.equal(dailyLoop({ marketOpen: false, market: { available: true, mealFood: 2, mealCapacity: 12, mealReadyAt: null, quotes: [{ item: 'food', buyMinor: 100, stock: 1 }] } }).button('Buy 2 food'), undefined);
  // Flag on: unchanged, it opens the Market.
  const on = dailyLoop({ marketOpen: true });
  assert.ok(on.button('Open food market')); on.button('Open food market').props.onClick();
  assert.deepEqual(on.navigated, ['market']); assert.deepEqual(on.bought, []);
});

test('flag off: a Kindle citizen works a shift, buys food (the daily-loop trade), prepares a meal, and capacity goes up', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  assert.deepEqual((await r.call('citizen', 'alice')).data.flags, { market: false });
  const started = await r.call('citizen', 'alice', { action: 'commit-work', workOrderId: 'harvest' });
  assert.equal(started.status, 200, JSON.stringify(started.data));
  const shift = started.data.shifts.find(s => !s.claimedAt);
  r.setNow(Date.parse(shift.completesAt) + 1000);
  assert.equal((await r.call('citizen', 'alice', { action: 'claim-work', shiftId: shift.id })).status, 200);
  const capacity = async () => (await r.db.prepare("SELECT capacity FROM citizens WHERE clerk_user_id='alice'").first()).capacity;
  const state = async () => (await r.call('citizen', 'alice')).data;
  const food = d => d.economy.inventory.find(i => i.item === 'food')?.quantity ?? 0;
  const afterShift = await state();
  assert.deepEqual(afterShift.flags, { market: false });
  const quote = afterShift.market.quotes.find(q => q.item === 'food');
  const quantity = Math.max(1, afterShift.market.mealFood - food(afterShift));
  const wallet = afterShift.economy.walletMinor;
  // Same checks as before: an oversize buy is refused.
  assert.notEqual((await r.call('citizen', 'alice', { action: 'market-trade', side: 'buy', item: 'food', quantity: 100000, requestId: randomUUID() })).status, 200);
  const bought = await r.call('citizen', 'alice', { action: 'market-trade', side: 'buy', item: 'food', quantity, requestId: randomUUID() });
  assert.equal(bought.status, 200, JSON.stringify(bought.data));
  const afterBuy = await state();
  assert.equal(food(afterBuy), food(afterShift) + quantity); assert.equal(afterBuy.economy.walletMinor, wallet - quote.buyMinor * quantity);
  const before = await capacity();
  assert.ok(before < 24, `room to recover: ${before}`);
  const meal = await r.call('citizen', 'alice', { action: 'household-meal', requestId: randomUUID() });
  assert.equal(meal.status, 200, JSON.stringify(meal.data));
  assert.ok(await capacity() > before, 'capacity went up after the meal');
  assert.ok(food(await state()) < food(afterBuy), 'the meal used food');
});

/** #451: GameShell defaults marketOpen to true, so the page must pass the flag on the <GameShell> tag itself. The loose regex above also matches
 *  the DailyLoop prop, which is how the dock tab, "Open Market" button and map building stayed visible with the flag off. */
test('#451 page.tsx passes marketOpen={marketShown} on the <GameShell> tag', async () => {
  const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('page.tsx', page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const shells = [];
  (function visit(node) {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(ast) === 'GameShell') shells.push(node);
    ts.forEachChild(node, visit);
  })(ast);
  assert.equal(shells.length, 1, 'exactly one <GameShell> in page.tsx');
  const attribute = shells[0].attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(ast) === 'marketOpen');
  assert.ok(attribute, '<GameShell> receives marketOpen (it defaults to true)');
  assert.equal(attribute.initializer?.getText(ast), '{marketShown}');
  const shell = await readFile(new URL('../app/game-shell.tsx', import.meta.url), 'utf8');
  assert.match(shell, /marketOpen = true/, 'the shell default that makes the missing prop show the Market');
});
