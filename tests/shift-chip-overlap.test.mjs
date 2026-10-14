/** #189: the active-shift chip must not float over the Country breadcrumb, heading or Zone overlay. Renders the REAL
 *  GameShell; the shipped CSS must take the Country header out of absolute positioning so it scrolls in flow. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { Window } from 'happy-dom';
const require = createRequire(import.meta.url);
const React = require('react'); const { renderToStaticMarkup } = require('react-dom/server');

const cache = new Map();
async function load(rel) {
  if (cache.has(rel)) return cache.get(rel);
  const src = await readFile(new URL(`../app/${rel}.tsx`, import.meta.url), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const deps = {};
  for (const [, name] of js.matchAll(/require\("([^"]+)"\)/g)) {
    if (name.startsWith('./') && !name.endsWith('.css') && !['./game-viewport', './game-timer', './square-chat'].includes(name)) deps[name] = await load(name.slice(2));
  }
  const exports = {}; const mod = { exports };
  new Function('exports', 'require', 'module', js)(exports, name => {
    if (deps[name]) return deps[name];
    if (name.endsWith('.css')) return {};
    if (name === './game-viewport') return { __esModule: true, default: () => null };
    if (name === './game-timer') return { GameTimer: () => null };
    if (name === './square-chat') return { SquareChat: () => null };
    if (name === '@phosphor-icons/react') return new Proxy({}, { get: () => () => null });
    if (name === '@clerk/nextjs') return { useClerk: () => ({ mountUserButton() {}, unmountUserButton() {} }) };
    if (name.startsWith('@/lib/')) return require(`../lib/${name.slice(6)}.ts`);
    if (name.startsWith('../lib/')) return require(`${name}.ts`);
    return require(name);
  }, mod);
  cache.set(rel, mod.exports); return mod.exports;
}

const nation = { id: 'kindle', name: 'Kindle Republic', capital: 'Forgehaven' };
const render = async (view) => { const { GameShell } = await load('game-shell');
  const map = React.createElement('section', null, React.createElement('h2', null, 'Country map'), React.createElement('label', null, 'Zone overlay'));
  const window = new Window(); const d = window.document;
  d.body.innerHTML = renderToStaticMarkup(React.createElement(GameShell, { view, nation, citizenNation: nation, nations: [nation], capacity: 18, localDemo: false, panel: null, onNavigate() {},
    countryMap: map, shiftSummary: { title: 'Catalogue the civic archive', endsAt: 2e9 } }));
  return d; };

test('Country puts breadcrumbs and the shift chip in the stage flow, before the heading and Zone overlay', async () => {
  const d = await render('country');
  const header = d.querySelector('.game-country-stage > .game-country-header');
  assert.ok(header, 'header lives inside the scrolling Country stage');
  assert.deepEqual([...header.children].map(e => e.className), ['game-location-banner game-breadcrumbs', 'game-shift-chip']);
  assert.equal(d.querySelectorAll('.game-shift-chip').length, 1); assert.equal(d.querySelectorAll('.game-breadcrumbs').length, 1);
  assert.equal(header.nextElementSibling.querySelector('h2').textContent, 'Country map', 'heading follows the header, not under it');
  const css = await readFile(new URL('../app/game-shell.css', import.meta.url), 'utf8');
  assert.match(css, /\.game-country-header>\.game-location-banner,\.game-country-header>\.game-shift-chip\{position:static;/);
  assert.match(css, /\.harimu-game \.game-country-stage\{padding-top:14px\}/, 'no 76px gap reserved for floating chrome');
});
test('other scenes keep the floating breadcrumbs and chip', async () => {
  const d = await render('square');
  assert.equal(d.querySelector('.game-country-header'), null);
  assert.ok(d.querySelector('main > .game-shift-chip')); assert.ok(d.querySelector('main > .game-breadcrumbs'));
});
test('Zone overlay choice survives a remount within the session (behavioural, #194)', async () => {
  const { WorldZones, zoneOverlayKey } = await load('world-zones');
  const window = new Window({ url: 'https://fixture.invalid/' });
  const saved = { window: globalThis.window, document: globalThis.document, sessionStorage: globalThis.sessionStorage, fetch: globalThis.fetch, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window, document: window.document, sessionStorage: window.sessionStorage, IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async () => new Response(JSON.stringify({ width: 1, height: 1, squares: [] })) });
  const { createRoot } = require('react-dom/client'); const { act } = React;
  const mount = async () => { const host = window.document.createElement('div'); window.document.body.append(host); const root = createRoot(host);
    await act(async () => root.render(React.createElement(WorldZones))); await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    return { root, box: () => host.querySelector('input[type="checkbox"]') }; };
  try {
    let view = await mount();
    assert.equal(view.box().checked, false, 'off by default');
    await act(async () => view.box().click());
    assert.equal(view.box().checked, true); assert.equal(window.sessionStorage.getItem(zoneOverlayKey), '1');
    await act(async () => view.root.unmount());
    view = await mount();
    assert.equal(view.box().checked, true, 'kept after leaving and returning to Country');
    await act(async () => view.box().click()); await act(async () => view.root.unmount());
    view = await mount(); assert.equal(view.box().checked, false, 'turning it off is kept too');
    await act(async () => view.root.unmount());
  } finally { Object.assign(globalThis, { window: saved.window, document: saved.document, sessionStorage: saved.sessionStorage, fetch: saved.fetch, IS_REACT_ACT_ENVIRONMENT: saved.act }); await window.happyDOM.close(); }
});
