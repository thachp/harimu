/** #392: zoom path World → Nation → City. NEXT_PUBLIC_HARIMU_ZOOM_PATH is a HARIMU_UI_PACK key.
 *  Preview on, production off. Flag off keeps the current breadcrumb. Household is not on the path. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { zoomPathCrumbs, zoomPathEnabled, zoomPathHref, ZOOM_PATH_FLAG } from '../lib/zoom-path.ts';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const lum = hex => { const c = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722; };
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const key = ZOOM_PATH_FLAG;

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK, preview on and production off', async () => {
  assert.equal(zoomPathEnabled('true'), true);
  for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(zoomPathEnabled(value), false);
  const preview = strip(await read('wrangler.jsonc')), prod = strip(await read('wrangler.prod.jsonc'));
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(expandFlagPacks(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv(preview.vars)[key], 'true'); assert.equal(varsForProcessEnv(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv({ HARIMU_UI_PACK: preview.vars.HARIMU_UI_PACK, [key]: 'false' })[key], 'false', 'a direct string wins');
  assert.ok(FLAG_PACKS.HARIMU_UI_PACK.includes(key));
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 61);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 61/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key));
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/zoom-path.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_ZOOM_PATH/);
  assert.equal((await read('lib/zoom-path.ts')).includes('pushState'), false);
  assert.equal((await read('lib/zoom-path.ts')).includes('replaceState'), false);
});

test('crumbs use the nation and city names already on the shell, and earlier steps link back', () => {
  const city = zoomPathCrumbs({ view: 'square', nationLabel: 'Aurelle', cityLabel: 'Highspire', nationId: 'aurelle', visitor: true });
  assert.deepEqual(city.map(step => step.label), ['World', 'Aurelle', 'Highspire']);
  assert.deepEqual(city.map(step => step.current), [false, false, true]);
  assert.equal(city[0].href, zoomPathHref('world', 'aurelle', undefined, true));
  assert.match(city[0].href, /^\?view=world&nation=aurelle$/);
  assert.match(city[1].href, /^\?view=country&nation=aurelle$/);
  assert.match(city[2].href, /^\?view=square&nation=aurelle$/);
  const nation = zoomPathCrumbs({ view: 'country', nationLabel: 'Aurelle', cityLabel: 'Highspire', nationId: 'aurelle' });
  assert.deepEqual(nation.map(step => [step.label, step.current]), [['World', false], ['Aurelle', true]]);
  assert.equal(zoomPathCrumbs({ view: 'world', nationLabel: 'Aurelle', cityLabel: 'Highspire', nationId: 'aurelle' }).length, 1);
  assert.equal(zoomPathCrumbs({ view: 'household', nationLabel: 'Aurelle', cityLabel: 'Highspire' }), null);
  assert.equal(zoomPathCrumbs({ view: 'workplace', nationLabel: 'Aurelle', cityLabel: 'Highspire' }), null);
  const held = zoomPathCrumbs({ view: 'square', nationLabel: 'Your nation', cityLabel: 'Your city' });
  assert.deepEqual(held.map(step => step.label), ['World', 'Your nation', 'Your city']);
  assert.equal(held[2].href, '?view=square');
});

test('styles meet AA, show focus, and reduced motion is instant', async () => {
  const css = await read('app/zoom-path.css');
  assert.ok(contrast('#f3ecd6', '#0d2530') >= 4.5, 'paper on the chip');
  assert.ok(contrast('#f1d58a', '#0d2530') >= 4.5, 'gold on the chip');
  assert.match(css, /background:var\(--s2-chip\)/);
  assert.match(css, /#0d2530/);
  assert.match(css, /#f3ecd6/);
  assert.match(css, /#f1d58a/);
  assert.match(css, /#d0ad54/);
  assert.match(css, /a:focus-visible\{outline:2px solid var\(--s2-paper\);outline-offset:2px\}/);
  assert.match(css, /@media\(prefers-reduced-motion:no-preference\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{\.game-zoom-on \.game-stage\{animation:none\}\}/);
  assert.match(css, /html\[data-harimu-reduced-motion\] \.game-zoom-on \.game-stage\{animation:none\}/);
  assert.match(css, /position:static/);
});

const builds = {};
const render = async (env, props) => {
  const id = JSON.stringify(env);
  builds[id] ??= await (await import('../scripts/hud-tooltip-check.mjs')).bundleShell(
    `import React from 'react'; import { renderToStaticMarkup } from 'react-dom/server'; import { GameShell } from './app/game-shell.tsx';
     globalThis.__renderShell = props => renderToStaticMarkup(<GameShell {...props} onNavigate={() => {}} onSelectNation={() => {}} accountControls={null} />);`,
    env);
  class MessageChannel { constructor() { const port1 = { onmessage: null, close() {} }; this.port1 = port1; this.port2 = { postMessage: data => setTimeout(() => port1.onmessage?.({ data }), 0), close() {} }; } }
  const sandbox = { MessageChannel, console, TextEncoder, TextDecoder, setTimeout, clearTimeout, queueMicrotask, URL, URLSearchParams };
  sandbox.globalThis = sandbox; sandbox.window = sandbox; sandbox.self = sandbox;
  vm.runInNewContext(builds[id], sandbox);
  const { shellProps } = await import('../scripts/hud-tooltip-check.mjs');
  return sandbox.__renderShell({ ...shellProps, localDemo: false, ...props });
};
const aurelle = { id: 'aurelle', name: 'Aurelle', capital: 'Highspire' };
const navOf = html => html.match(/<nav class="game-zoom-path"[\s\S]*?<\/nav>/)?.[0] ?? '';

test('flag on shows the path under the header; flag off keeps the old breadcrumb; the bar is not covered', async () => {
  const off = await render({ NEXT_PUBLIC_HARIMU_ZOOM_PATH: 'false' }, { view: 'square', nation: aurelle, citizenNation: aurelle, currentCityName: 'Highspire' });
  assert.equal(off.includes('game-zoom-path'), false);
  assert.match(off, /class="game-location-banner game-breadcrumbs"/);
  const on = await render({ NEXT_PUBLIC_HARIMU_ZOOM_PATH: 'true', NEXT_PUBLIC_HARIMU_RESOURCE_BAR: 'true', NEXT_PUBLIC_HARIMU_UI_V2_RAIL: 'true' }, { view: 'square', nation: aurelle, citizenNation: aurelle, currentCityName: 'Highspire', currencyCode: 'CRN', walletMinor: 800, inventory: { food: 8 }, capacity: 12 });
  const hud = on.slice(on.indexOf('<header'), on.indexOf('</header>'));
  assert.match(hud, /game-resource-bar/);
  assert.equal(hud.includes('game-zoom-path'), false, 'the path is not inside the header that holds the resource bar');
  assert.equal(on.includes('game-breadcrumbs'), false, 'the rail still replaces the old breadcrumb');
  const nav = navOf(on);
  assert.match(nav, /aria-label="Zoom path"/);
  assert.match(nav, /<a href="\?view=world&amp;nation=aurelle">World<\/a>/);
  assert.match(nav, /<a href="\?view=country&amp;nation=aurelle">Aurelle<\/a>/);
  assert.match(nav, /<span aria-current="page">Highspire<\/span>/);
  assert.ok(on.indexOf('game-zoom-path') > on.indexOf('</header>'), 'on the city view the path follows the header');
  const nation = navOf(await render({ NEXT_PUBLIC_HARIMU_ZOOM_PATH: 'true' }, { view: 'country', nation: aurelle, citizenNation: aurelle, currentCityName: 'Highspire' }));
  assert.match(nation, /<a href="\?view=world&amp;nation=aurelle">World<\/a>/);
  assert.match(nation, /<span aria-current="page">Aurelle<\/span>/);
  assert.doesNotMatch(nation, /Highspire/);
  const world = navOf(await render({ NEXT_PUBLIC_HARIMU_ZOOM_PATH: 'true' }, { view: 'world', nation: aurelle, citizenNation: aurelle }));
  assert.match(world, /<span aria-current="page">World<\/span>/);
  assert.doesNotMatch(world, /<a /);
  const home = await render({ NEXT_PUBLIC_HARIMU_ZOOM_PATH: 'true' }, { view: 'household', nation: aurelle, citizenNation: aurelle, currentCityName: 'Highspire' });
  assert.equal(home.includes('game-zoom-path'), false);
  assert.equal(home.includes('game-zoom-on'), false);
  const shell = await read('app/game-shell.tsx');
  assert.match(shell, /zoomTrail \?\? \(railOn \? null : breadcrumbs\)/);
  assert.match(shell, /preventDefault\(\); navigate\(crumb\.view\)/);
});
