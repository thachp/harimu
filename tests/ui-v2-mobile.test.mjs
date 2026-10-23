/** #392 S8 mobile pass, flag NEXT_PUBLIC_HARIMU_UI_V2_MOBILE ("true" in preview, "false" in production): on phones the S4 rail + place tabs become a bottom tab bar
 *  and the panel a bottom sheet, CSS only. The real GameShell rendered with the flag compiled off and on (same assertions), plus flag, CSS-scope and harness pins. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { uiV2MobileEnabled } from '../lib/ui-v2-mobile.ts';
const read = p => readFile(new URL(`../${p}`, import.meta.url), 'utf8');

test('flag pinned: "true" in preview, "false" in production; only the exact string "true" enables it, and only with the S4 rail', async () => {
  assert.match(await read('wrangler.jsonc'), /"NEXT_PUBLIC_HARIMU_UI_V2_MOBILE":\s*"true"/);
  assert.match(await read('wrangler.prod.jsonc'), /"NEXT_PUBLIC_HARIMU_UI_V2_MOBILE":\s*"false"/);
  assert.equal(uiV2MobileEnabled('true', true), true);
  for (const v of ['false', 'TRUE', '1', '', undefined]) assert.equal(uiV2MobileEnabled(v, true), false);
  assert.equal(uiV2MobileEnabled('true', false), false);
});

const destinations = [{ id: 'household', label: 'Household', detail: 'Belongings and recovery' }, { id: 'workplace', label: 'Workplace', detail: 'Contributions and earnings' }];
const render = async (flag, view = 'square', rail = 'true') => {
  const { build } = await import('esbuild');
  const out = await build({ stdin: { contents: "export { GameShell } from './app/game-shell.tsx';", resolveDir: new URL('..', import.meta.url).pathname, loader: 'tsx' }, bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') }, loader: { '.css': 'empty' }, logLevel: 'silent', plugins: [{ name: 'css-modules', setup(b) { b.onResolve({ filter: /\.module\.css$/ }, () => ({ path: 'm', namespace: 'cssm' })); b.onLoad({ filter: /.*/, namespace: 'cssm' }, () => ({ contents: 'export default new Proxy({}, { get: (_, k) => String(k) })' })); } }], define: { 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_MOBILE': JSON.stringify(flag), 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_RAIL': JSON.stringify(rail), 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CITY': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_PANEL': '"true"' } });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
  const nation = { id: 'kindle', name: 'Kindle Republic', capital: 'Forgehaven', currency: 'Spark' };
  return renderToStaticMarkup(React.createElement(mod.GameShell, { view, nation, citizenNation: nation, nations: [nation], capacity: 18, localDemo: true, worldClock: { gameDay: 12, latestTick: 140 }, onNavigate: () => {}, onSelectNation: () => {}, accountControls: null,
    contextTitle: 'City destinations', contextItems: destinations, panel: React.createElement('p', null, 'PANEL') }));
};


for (const flag of ['false', 'true']) for (const view of ['square', 'country', 'world']) test(`flag ${flag}, ${view}: same nav controls in the same DOM order; class only with the flag on`, async () => {
  const html = await render(flag, view), off = await render('false', view);
  assert.equal(/class="harimu-game[^"]*\bgame-mobile-v2\b/.test(html), flag === 'true');
  const nav = h => [...h.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map(m => m[0].replace(/ class="[^"]*"/g, '')).join('|');
  assert.equal(nav(html), nav(off), 'markup other than the root class is unchanged');
  const order = h => ['game-stage', 'game-nav-row', 'game-inspector'].map(c => [h.indexOf(`class="${c}`), c]).sort((a, b) => a[0] - b[0]).map(x => x[1]).join();
  assert.equal(order(html), order(off), 'scene, nav row and panel keep their DOM (reading and Tab) order');
});

test('without the S4 rail the flag does nothing', async () => assert.doesNotMatch(await render('true', 'square', 'false'), /game-mobile-v2/));

test('S8 CSS is phone-only and scoped to .game-mobile-v2; no display:none, so nothing leaves the accessibility tree', async () => {
  const css = await read('app/game-shell.css'), block = css.slice(css.indexOf('/* #392 S8'), css.indexOf('/* #85: nation skin'));
  assert.ok(block.length > 100);
  const media = [...block.matchAll(/@media\(([^)]*)\)\{([\s\S]*?)\n\}/g)];
  assert.ok(media.length >= 1); for (const [, q] of media) assert.equal(q, 'max-width:760px');
  for (const rule of block.replace(/^\/\*[\s\S]*?\*\//, '').match(/[^{}]+\{[^{}]*\}/g)) if (!rule.trim().startsWith('@')) assert.match(rule, /\.game-mobile-v2/, rule);
  assert.doesNotMatch(block, /display:none|visibility:hidden/);
});

test('every harness that defines UI_V2_CITY defines UI_V2_MOBILE; the check is registered', async () => {
  for (const f of (await readdir(new URL('../scripts/', import.meta.url))).filter(f => f.endsWith('.mjs'))) {
    const src = await read(`scripts/${f}`);
    if (/['"]process\.env\.NEXT_PUBLIC_HARIMU_UI_V2_CITY['"]\s*:/.test(src)) assert.match(src, /['"]process\.env\.NEXT_PUBLIC_HARIMU_UI_V2_MOBILE['"]\s*:/, f);
  }
  assert.match(await read('scripts/hud-layout-check.mjs'), /checkUiV2Mobile/);
});
