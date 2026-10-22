/** #392 S4: zoom rail, flag NEXT_PUBLIC_HARIMU_UI_V2_RAIL ("true" in preview, "false" in production). Pins plus a render of the real GameShell, built with
 *  the flag off and on (build-time define, as in the app), with the same assertions. The browser layout check is scripts/ui-v2-rail-check.mjs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import vm from 'node:vm';
import { railCurrent, railKeyTarget, railLevelOf, railLevels, uiV2RailEnabled } from '../lib/ui-v2-rail.ts';
const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');

test('flag: preview on, production off, only the exact string "true" enables it', async () => {
  assert.match(await read('wrangler.jsonc'), /"NEXT_PUBLIC_HARIMU_UI_V2_RAIL":\s*"true"/);
  assert.match(await read('wrangler.prod.jsonc'), /"NEXT_PUBLIC_HARIMU_UI_V2_RAIL":\s*"false"/);
  assert.equal(uiV2RailEnabled('true'), true);
  for (const v of [undefined, '', 'false', 'TRUE', '1']) assert.equal(uiV2RailEnabled(v), false);
});

test('levels, current level and arrow-key targets', () => {
  assert.deepEqual(railLevels.map(l => l.name), ['World', 'Nation', 'City']);
  assert.deepEqual(['world', 'country', 'nation', 'square', 'household', 'workplace', 'market', 'government'].map(railLevelOf), ['world', 'country', 'country', 'square', 'square', 'square', 'square', 'square']);
  assert.equal(railCurrent('square', 'square'), 'page'); assert.equal(railCurrent('square', 'household'), 'location'); assert.equal(railCurrent('world', 'household'), undefined);
  assert.equal(railCurrent('country', 'nation'), 'location');
  assert.equal(railKeyTarget('ArrowDown', 2, 3), 0); assert.equal(railKeyTarget('ArrowUp', 0, 3), 2); assert.equal(railKeyTarget('ArrowRight', 0, 3), 1);
  assert.equal(railKeyTarget('Home', 2, 3), 0); assert.equal(railKeyTarget('End', 0, 3), 2); assert.equal(railKeyTarget('Enter', 0, 3), null);
});

const builds = {};
const render = async (flag, view) => {
  const { bundleShell, shellProps } = await import('../scripts/hud-tooltip-check.mjs');
  builds[flag] ??= await bundleShell(`import React from 'react'; import { renderToStaticMarkup } from 'react-dom/server'; import { GameShell } from './app/game-shell.tsx';
    globalThis.__renderShell = props => renderToStaticMarkup(<GameShell {...props} onNavigate={() => {}} onSelectNation={() => {}} accountControls={null} />);`, { NEXT_PUBLIC_HARIMU_UI_V2_RAIL: flag });
  // A fresh context without MessageChannel: the browser build of react-dom/server would otherwise keep a port open and the test process alive.
  class MessageChannel { constructor() { const port1 = { onmessage: null, close() {} }; this.port1 = port1; this.port2 = { postMessage: data => setTimeout(() => port1.onmessage?.({ data }), 0), close() {} }; } }
  const sandbox = { MessageChannel, console, TextEncoder, TextDecoder, setTimeout, clearTimeout, queueMicrotask, URL, URLSearchParams };
  sandbox.globalThis = sandbox; sandbox.window = sandbox; sandbox.self = sandbox;
  vm.runInNewContext(builds[flag], sandbox);
  return sandbox.__renderShell({ ...shellProps, view });
};
const tabs = html => [...(html.match(/<nav id="game-location-dock"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? '').matchAll(/aria-label="Open ([^"]+)"/g)].map(m => m[1]);
const rail = html => html.match(/<nav class="game-zoom-rail"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? null;
const expectFor = (flag, view, html) => {
  const on = flag === 'true';
  assert.equal(html.includes('game-rail-on'), on, `${view}: rail class with the flag ${flag}`);
  assert.equal(rail(html) !== null, on, `${view}: rail with the flag ${flag}`);
  assert.equal(html.includes('game-breadcrumbs'), !on, `${view}: the breadcrumb only with the flag off (the rail replaces it)`);
  assert.deepEqual(tabs(html), on ? ['Household', 'Work', 'Market', 'Civic'] : ['World', 'Country', 'City', 'Household', 'Work', 'Market', 'Civic'], `${view}: top tabs with the flag ${flag}`);
  if (on) {
    const r = rail(html);
    assert.deepEqual([...r.matchAll(/aria-label="Open ([^"]+)"/g)].map(m => m[1]), ['World', 'Nation', 'City']);
    const current = [...r.matchAll(/<button[^>]*aria-label="Open ([^"]+)"[^>]*aria-current="([^"]+)"/g)].map(m => `${m[1]}:${m[2]}`);
    assert.deepEqual(current, [{ world: 'World:page', country: 'Nation:page', square: 'City:page', household: 'City:location' }[view]], `${view}: aria-current on the active level`);
    const world = r.match(/<button[^>]*aria-label="Open World"[^>]*>/)[0];
    for (const attr of ['type="submit"', 'form="world-tab-form"', 'name="view"', 'value="world"']) assert.ok(world.includes(attr), `World keeps the #379 no-JS submit (${attr})`);
  }
};

test('render: GameShell with the flag off and on, same assertions, four views', async () => {
  for (const flag of ['false', 'true']) for (const view of ['world', 'country', 'square', 'household']) expectFor(flag, view, await render(flag, view));
  assert.throws(() => expectFor('false', 'square', '<main class="game-rail-on">'));
});

test('game-shell reads the flag itself, once', async () => {
  const shell = await read('app/game-shell.tsx');
  assert.equal((shell.match(/uiV2RailEnabled\(\)/g) || []).length, 1);
  assert.match(shell, /const railOn = uiV2RailEnabled\(\);/);
});

test('S4 CSS sits before the S2 block (whose rules must all be .game-hud-v2 scoped) and every S4 rule is scoped to the rail', async () => {
  const css = await read('app/game-shell.css');
  const start = css.indexOf('/* #392 S4 zoom rail'), end = css.indexOf('/* #392 S2:');
  assert.ok(start > 0 && start < end);
  const block = css.slice(css.indexOf('*/', start) + 2, end).replace(/@media\([^)]*\)\{/g, '');
  for (const sel of [...block.matchAll(/([^{}]+)\{[^{}]*\}/g)].map(m => m[1].trim()).filter(Boolean)) for (const part of sel.split(',')) assert.match(part, /\.game-rail-on|\.game-zoom-rail/, `unscoped S4 selector: ${part}`);
});

test('every esbuild harness that defines UI_V2_PANEL also defines UI_V2_RAIL', async () => {
  for (const f of (await readdir(new URL('../scripts/', import.meta.url))).filter(f => f.endsWith('.mjs'))) {
    const src = await read(`scripts/${f}`);
    if (/['"]process\.env\.NEXT_PUBLIC_HARIMU_UI_V2_PANEL['"]\s*:/.test(src)) assert.match(src, /['"]process\.env\.NEXT_PUBLIC_HARIMU_UI_V2_RAIL['"]\s*:/, `${f} must define UI_V2_RAIL`);
  }
});
