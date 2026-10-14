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
test('Zone overlay choice is remembered for the session (#189 follow-up)', async () => {
  const src = await readFile(new URL('../app/world-zones.tsx', import.meta.url), 'utf8');
  assert.match(src, /zoneOverlayKey = 'harimu:zone-overlay'/);
  assert.match(src, /sessionStorage\.getItem\(zoneOverlayKey\) === '1'/); assert.match(src, /sessionStorage\.setItem\(zoneOverlayKey/);
});
