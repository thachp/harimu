/** #1315 N1. NEXT_PUBLIC_HARIMU_NEIGHBORHOOD is HARIMU_UI_PACK entry 67. Preview on, production off.
 *  Flag off matches a missing flag and today's City panel. Desktop checks are 1280 and 150% text. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { neighborhoodEnabled, NEIGHBORHOOD_FLAG } from '../lib/neighborhood.ts';
import { nationForNavigation, sceneFromSearch, viewModes } from '../lib/scene-navigation.ts';
import { cityDestinations } from '../lib/city-destinations.ts';
import { capitalCityForNation } from '../lib/cities.ts';
import { nationMark } from '../lib/nation-themes.ts';
import { notableProfile } from '../lib/notable-profiles.ts';
const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const key = NEIGHBORHOOD_FLAG;
const root = fileURLToPath(new URL('..', import.meta.url));
const place = id => { const city = capitalCityForNation(id), mark = nationMark(id); return { nation: { id, name: mark.name, government: 'G', capital: city.name, currency: id === 'aurelle' ? 'CRN' : id === 'korund' ? 'LN' : 'SPK', economy: 'E', religion: 'R' }, currentCityName: city.name, destinations: cityDestinations(id, true) }; };
const vale = notableProfile('kindle');
const residents = [{ key: 'h:0', name: 'Citizen', nationId: 'kindle', kind: 'human', status: 'idle', you: true }, { key: `ai:${vale.id}`, name: vale.name, nationId: 'kindle', kind: 'ai', status: 'working', you: false }];
const kindle = { ...place('kindle'), residents, city: capitalCityForNation('kindle') };
const bundles = {};
const bundle = async (flag) => {
  if (bundles[flag]) return bundles[flag];
  const define = { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_RAIL': '"true"' };
  if (flag !== undefined) define[`process.env.${key}`] = JSON.stringify(flag);
  const result = await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `import React, { useState } from 'react'; import { createRoot } from 'react-dom/client'; import { renderToStaticMarkup } from 'react-dom/server'; import { GameShell } from './app/game-shell.tsx'; import { CitySummary, NeighborhoodSummary } from './app/scene-panels-v2.tsx';
    function Demo(props) { const [view, setView] = useState(props.view ?? 'square'); const panel = view === 'neighborhood' ? <NeighborhoodSummary cityName={props.currentCityName} nation={props.nation} destinations={props.destinations} residents={props.residents} onView={setView} /> : view === 'square' ? <CitySummary cityName={props.currentCityName} city={props.city} nation={props.nation} destinations={props.destinations} onView={setView} visitor={false} enabled icons places={false} identity={false} /> : <p data-view={view}>{view}</p>; return <GameShell {...props} view={view} panel={panel} onNavigate={setView} onSelectNation={() => {}} onOpenWallet={() => {}} />; }
    globalThis.__html = props => renderToStaticMarkup(<Demo {...props} />); globalThis.__mount = props => { const el = document.getElementById('root'); (globalThis.__root ??= createRoot(el)).render(<Demo {...props} />); };` },
    bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', target: 'es2022', logLevel: 'silent', define, banner: { js: 'var process = globalThis.process || { env: {} };' }, alias: { '@': root.replace(/\/$/, '') }, loader: { '.css': 'empty' },
    plugins: [{ name: 'stubs', setup(b) {
      b.onResolve({ filter: /^(\.\/game-viewport|@clerk\/nextjs)$/ }, a => ({ path: a.path, namespace: 'stub' }));
      b.onResolve({ filter: /\.module\.css$/ }, () => ({ path: 'css-module', namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: a.path === 'css-module' ? 'export default new Proxy({}, { get: (_, k) => String(k) })' : a.path === '@clerk/nextjs' ? 'export const useClerk=()=>({})' : 'export default function V(){return null}', loader: 'jsx' }));
    } }] });
  return bundles[flag] = result.outputFiles[0].text;
};
const htmlOf = async (flag, props) => {
  const script = await bundle(flag);
  class MessageChannel { constructor() { const port1 = { onmessage: null, close() {} }; this.port1 = port1; this.port2 = { postMessage: data => setTimeout(() => port1.onmessage?.({ data }), 0), close() {} }; } }
  const sandbox = { MessageChannel, console, TextEncoder, TextDecoder, setTimeout, clearTimeout, queueMicrotask, URL, URLSearchParams, process: { env: {} } };
  sandbox.globalThis = sandbox; sandbox.window = sandbox; sandbox.self = sandbox; vm.runInNewContext(script, sandbox); return sandbox.__html(props);
};
test('flag is on only for the exact string "true", pack entry 67, preview on and production off', async () => {
  const previous = process.env[key];
  try {
    delete process.env[key]; assert.equal(neighborhoodEnabled(), false); assert.equal(sceneFromSearch('?view=neighborhood'), 'square');
    for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(neighborhoodEnabled(value), false);
    assert.equal(neighborhoodEnabled('true'), true); process.env[key] = 'true'; assert.equal(neighborhoodEnabled(), true); assert.equal(sceneFromSearch('?view=neighborhood'), 'neighborhood');
  } finally { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; }
  const preview = strip(await read('wrangler.jsonc')), prod = strip(await read('wrangler.prod.jsonc'));
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(expandFlagPacks(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv(preview.vars)[key], 'true'); assert.equal(varsForProcessEnv(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv({ HARIMU_UI_PACK: preview.vars.HARIMU_UI_PACK, [key]: 'false' })[key], 'false', 'a direct string wins');
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 68); assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(66), key, 'entry 67');
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(65), 'NEXT_PUBLIC_HARIMU_CONCEPT_CHROME', 'entry 66 stays concept chrome');
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(64), 'NEXT_PUBLIC_HARIMU_HOUSEHOLD_FACT_VALUE_ALIGN', 'entry 65 stays household fact value align');
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 68/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key)); assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/neighborhood.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_NEIGHBORHOOD/);
  assert.match(await read('lib/scene-navigation.ts'), /personalViews: readonly string\[\] = \[[^\]]*neighborhood/);
  assert.equal(viewModes.includes('neighborhood'), true); assert.equal(viewModes.includes('military'), false); assert.equal(viewModes.includes('economy'), false);
  assert.equal(nationForNavigation('neighborhood', 'world', 'korund', 'kindle'), 'kindle'); assert.equal(nationForNavigation('neighborhood', 'nation', 'aurelle', 'kindle'), 'kindle');
  assert.doesNotMatch(await read('lib/city-places.ts'), /neighborhood/); assert.doesNotMatch(await read('lib/ui-v2-rail.ts'), /neighborhood/);
  assert.equal((await read('app/game-shell.tsx')).includes("name: 'Neighborhood'"), false);
  const css = await read('app/neighborhood.css');
  const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(?:^|\})([^{}]+)\{/g)].map(m => m[1].trim()).filter(Boolean);
  for (const sel of rules) for (const part of sel.split(',')) assert.match(part.trim(), /^\.game-neighborhood\b/, part);
  for (const rule of [/overflow-wrap:normal/, /word-break:normal/, /hyphens:none/]) assert.match(css, rule);
  assert.equal(css.includes('@media'), false);
  assert.equal(cityDestinations('kindle', true).find(card => card.id === 'market').label, 'Market');
  assert.equal(cityDestinations('aurelle', true).find(card => card.id === 'market').label, 'Chartered food');
  assert.equal(cityDestinations('korund', true).find(card => card.id === 'workplace').label, 'Assignment');
  assert.equal(cityDestinations('korund', true).find(card => card.id === 'market').label, 'State store');
});
test('flag off matches a missing flag and today; flag on shows the City entry and the neighborhood view', async () => {
  const off = await htmlOf('false', kindle), missing = await htmlOf(undefined, kindle), on = await htmlOf('true', kindle);
  assert.equal(missing, off, 'a missing flag matches flag off');
  assert.doesNotMatch(off, /Neighborhood|neighborhood-v2|game-neighborhood/);
  assert.match(on, /game-neighborhood/); assert.match(on, /<strong>Neighborhood<\/strong>/); assert.match(on, /Forgehaven · Kindle Republic/);
  const open = await htmlOf('true', { ...kindle, view: 'neighborhood' });
  assert.match(open, /<h2>Neighborhood<\/h2><p>Forgehaven · Kindle Republic<\/p>/); assert.match(open, /Living in Forgehaven/); assert.match(open, /Citizen \(you\)/);
  assert.match(open, new RegExp(residents.find(person => person.kind === 'ai').name)); assert.match(open, /<strong>Workplace<\/strong>/); assert.match(open, /<strong>Market<\/strong>/);
  for (const id of ['aurelle', 'korund']) { const spec = place(id); const html = await htmlOf('true', { ...spec, view: 'neighborhood', residents: [] });
    assert.match(html, new RegExp(`<h2>Neighborhood</h2><p>${spec.currentCityName} · ${spec.nation.name}</p>`));
    for (const card of spec.destinations.filter(card => card.id === 'workplace' || card.id === 'market')) assert.match(html, new RegExp(`<strong>${card.label}</strong>`)); }
  const dock = [...on.matchAll(/id="game-location-dock"[\s\S]*?<\/nav>/g)].at(-1)[0];
  assert.doesNotMatch(dock, /Neighborhood/); assert.match(on, /aria-label="Zoom level"/); assert.equal((on.match(/aria-label="Zoom level"[\s\S]*?<\/nav>/)[0].match(/<button/g) ?? []).length, 3);
});
const shots = () => { try { const dir = process.env.HARIMU_TEST_ARTIFACTS_DIR || join(os.tmpdir(), 'harimu-1315-neighborhood'); mkdirSync(dir, { recursive: true }); return dir; } catch { return null; } };
test('City entry and Neighborhood stay readable at 1280 and 150% text', async (t) => {
  let chromium; try { ({ chromium } = await import('playwright')); } catch { return t.skip('playwright is not installed'); }
  let browser; try { browser = await chromium.launch({ args: ['--disable-gpu', '--disable-dev-shm-usage'] }); } catch { return t.skip('headless chromium is not installed'); }
  const script = await bundle('true'), css = (await Promise.all(['app/game-shell.css', 'app/panel-v2.css', 'app/neighborhood.css'].map(read))).join('\n');
  const dir = shots();
  try {
    for (const spec of [{ name: '1280', scale: '' }, { name: '1280-150', scale: '1.5' }]) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.setContent(`<!doctype html><html style="${spec.scale ? `--text-scale:${spec.scale}` : ''}"><head><style>*{box-sizing:border-box}body{margin:0}svg{display:block}${css}</style></head><body><div id="root"></div></body></html>`, { waitUntil: 'load' });
      await page.addScriptTag({ content: script }); await page.evaluate(props => window.__mount(props), kindle); await page.waitForSelector('.panel-v2-rows button');
      await page.evaluate(() => { globalThis.__fit = () => [...document.querySelectorAll('.game-inspector-title h1, .neighborhood-v2 h2, .neighborhood-v2 .panel-v2-summary p, .neighborhood-v2 .panel-v2-rows strong, .neighborhood-v2 .panel-v2-rows small, .neighborhood-v2 li, .panel-v2-rows strong, .panel-v2-rows small')].filter(node => node.textContent.trim() && node.clientWidth > 0).every(node => node.scrollWidth <= node.clientWidth + 1); });
      const city = await page.evaluate(() => { const rail = [...document.querySelectorAll('.game-zoom-rail button')]; const dock = [...document.querySelectorAll('#game-location-dock button span')].map(node => node.textContent.trim()); const entry = [...document.querySelectorAll('.panel-v2-rows button')].find(node => node.textContent.includes('Neighborhood')); return { rail: rail.map(node => [node.textContent.trim(), node.getAttribute('aria-current')]), dock, entry: Boolean(entry), fit: globalThis.__fit(), text: document.body.innerText }; });
      assert.deepEqual(city.rail.filter(([, current]) => current).map(([name]) => name), ['City'], spec.name); assert.equal(city.rail.length, 3, spec.name); assert.equal(city.dock.includes('Neighborhood'), false, spec.name);
      assert.equal(city.entry, true, spec.name); assert.equal(city.fit, true, spec.name); assert.match(city.text, /Forgehaven · Kindle Republic/);
      if (dir) await page.screenshot({ path: join(dir, `neighborhood-1315-${spec.name}-city.png`) });
      await page.locator('.panel-v2-rows button', { hasText: 'Neighborhood' }).click(); await page.waitForSelector('.neighborhood-v2 h2');
      const open = await page.evaluate(() => { const rail = [...document.querySelectorAll('.game-zoom-rail button')]; return { current: rail.filter(node => node.getAttribute('aria-current')).map(node => node.textContent.trim()), fit: globalThis.__fit(), text: document.querySelector('.neighborhood-v2').innerText, crest: Boolean(document.querySelector('.neighborhood-v2 .nation-crest')) }; });
      assert.deepEqual(open.current, ['City'], spec.name); assert.equal(open.fit, true, spec.name); assert.match(open.text, /Neighborhood\n+Forgehaven · Kindle Republic/); assert.match(open.text, /Workplace/); assert.match(open.text, /Market/); assert.match(open.text, /Living in Forgehaven/); assert.equal(open.crest, true, spec.name);
      if (dir) await page.screenshot({ path: join(dir, `neighborhood-1315-${spec.name}-open.png`) });
      await page.locator('.neighborhood-v2 .panel-v2-rows button', { hasText: 'Market' }).click(); await page.waitForSelector('[data-view="market"]');
      await page.close();
    }
  } finally { await browser.close(); }
});
