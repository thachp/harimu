/** #800: rare resource node marker on the Resources overlay, flag NEXT_PUBLIC_HARIMU_RARE_MARKER ("true" in preview, "false" in production).
 *  The real MapOverlays in happy-dom with real React, the flag compiled in off and on, the same assertions; plus flag, CSS and check pins. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { Window } from 'happy-dom';
const require = createRequire(import.meta.url);
const read = p => readFile(new URL(`../${p}`, import.meta.url), 'utf8');

const w = new Window({ url: 'http://localhost/' }); globalThis.window = w; globalThis.document = w.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react'); const { createRoot } = require('react-dom/client'); const { act } = React;
const source = await read('app/map-overlays.tsx');
const load = flag => {
  const js = ts.transpileModule(source.replaceAll('process.env.NEXT_PUBLIC_HARIMU_RARE_MARKER', JSON.stringify(flag)), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const mod = { exports: {} }; new Function('exports', 'require', 'module', js)(mod.exports, n => n.startsWith('../lib/') ? require(`${n}.ts`) : require(n), mod); return mod.exports;
};
const fixture = { width: 24, height: 18, cells: [[2, 5, 'food'], [9, 9, 'ore'], [12, 6, 'Emberstone'], [14, 6, 'Riverpearl']], totals: [{ resource: 'Emberstone', squares: 1 }, { resource: 'Riverpearl', squares: 1 }, { resource: 'food', squares: 1 }, { resource: 'ore', squares: 1 }] };

async function render(flag, lowGraphics = false) {
  window.sessionStorage.clear(); globalThis.fetch = async () => new Response(JSON.stringify(fixture), { status: 200 });
  const { MapOverlaysControl } = load(flag);
  const el = document.createElement('div'); el.className = 'game-viewport'; document.body.appendChild(el); const root = createRoot(el);
  await act(async () => root.render(React.createElement(MapOverlaysControl, { enabled: true, lowGraphics })));
  await act(async () => [...el.querySelectorAll('button')].find(b => b.textContent === 'Resources').dispatchEvent(new w.MouseEvent('click', { bubbles: true })));
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  const out = { layer: el.querySelector('.map-resources'), legend: [...el.querySelectorAll('.map-overlays-legend li')] };
  return { ...out, close: async () => { await act(async () => root.unmount()); el.remove(); } };
}

for (const flag of ['false', 'true']) for (const low of [false, true]) test(`flag ${flag}${low ? ', low graphics' : ''}: rare nodes, legend and copy (same assertions)`, async () => {
  const on = flag === 'true', m = await render(flag, low);
  assert.ok(m.layer, 'Resources layer renders');
  assert.equal(m.layer.getAttribute('aria-hidden'), 'true', 'the layer stays decorative; the legend carries the name');
  assert.equal(m.layer.getAttribute('data-rare-marker'), on ? 'true' : null);
  assert.equal(m.layer.getAttribute('data-low-graphics'), low ? 'true' : null);
  const rare = [...m.layer.querySelectorAll('span[data-rare="true"]')].map(s => s.dataset.resource);
  assert.deepEqual(rare.sort(), ['Emberstone', 'Riverpearl'], 'rare is still marked per node');
  assert.deepEqual(m.legend.map(li => li.textContent), ['✹ Emberstone (rare): 1 square', '◉ Riverpearl (rare): 1 square', '✿ Food: 1 square', '◆ Ore: 1 square'], 'legend copy unchanged');
  const keys = m.legend.map(li => li.querySelector('span[aria-hidden="true"]').classList.contains('map-rare-key'));
  assert.deepEqual(keys, on ? [true, true, false, false] : [false, false, false, false], 'the legend badge matches the map badge, rare only');
  await m.close();
});

test('flag pinned: "true" in preview, "false" in production, compiled from the default param', async () => {
  assert.match(await read('wrangler.jsonc'), /"NEXT_PUBLIC_HARIMU_RARE_MARKER":\s*"true"/);
  assert.match(await read('wrangler.prod.jsonc'), /"NEXT_PUBLIC_HARIMU_RARE_MARKER":\s*"false"/);
  assert.match(source, /rareMarker = process\.env\.NEXT_PUBLIC_HARIMU_RARE_MARKER === 'true'/);
});

test('CSS: the badge is scoped to the flag attribute and the legend key; the flag-off ring is unchanged', async () => {
  const css = await read('app/game-shell.css');
  assert.match(css, /\.map-resources>span\[data-rare\]\{border:1px solid #d0ad54;border-radius:50%;padding:1px\}/);
  const badge = css.match(/\.map-resources\[data-rare-marker\]>span\[data-rare\],\.map-overlays-legend \.map-rare-key\{[^}]*\}/)?.[0];
  assert.ok(badge, 'badge rule');
  for (const p of [/border:2px solid/, /border-radius:50%/, /background:#/, /box-shadow:/]) assert.match(badge, p);
});

test('every esbuild harness that defines UI_V2_NATION also defines RARE_MARKER; the check runs in hud-layout-check', async () => {
  for (const f of (await readdir(new URL('../scripts/', import.meta.url))).filter(f => f.endsWith('.mjs'))) {
    const src = await read(`scripts/${f}`);
    if (/['"]process\.env\.NEXT_PUBLIC_HARIMU_UI_V2_NATION['"]\s*:/.test(src)) assert.match(src, /['"]process\.env\.NEXT_PUBLIC_HARIMU_RARE_MARKER['"]\s*:/, `${f} must define RARE_MARKER`);
  }
  assert.match(await read('scripts/hud-layout-check.mjs'), /await checkRareMarker\(/);
  const check = await read('scripts/rare-marker-check.mjs');
  assert.match(check, /\[\[1280, 800\], \[390, 844\], \[320, 700\]\]/);
  assert.match(check, /\['false', 'true'\]/);
});
