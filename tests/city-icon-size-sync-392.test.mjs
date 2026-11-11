/** #392 UI 61: City panel icons follow text size. NEXT_PUBLIC_HARIMU_CITY_ICON_SIZE_SYNC is HARIMU_UI_PACK entry 58.
 *  Preview on, production off. Flag off keeps width 16 and 18. Flag on, those svgs use 1em and font-size carries the scale.
 *  Only the City panel changes. World, Nation, Household, Workplace, Market and Government stay as they are. Map pills stay size 14. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { cityIconSizeSyncEnabled, CITY_ICON_SIZE_SYNC_FLAG } from '../lib/city-icon-size-sync.ts';
import { ICON_SIZE_SCALE_GATE_FLAG } from '../lib/icon-size-scale-gate.ts';
import { cityDestinations } from '../lib/city-destinations.ts';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const key = CITY_ICON_SIZE_SYNC_FLAG;
const aurelle = { id: 'aurelle', name: 'Aurelle', shortName: 'Aurelle', government: 'Absolute hereditary monarchy', capital: 'Highspire', currency: 'Crown (CRN) · gold-backed', economy: 'Royal charters and fiefs', religion: 'Kinward Rite state church', population: '924k' };
const highspire = { capital: true, description: 'The royal cliff capital, connected by gilded bridges above a gorge.' };
const widths = html => [...html.matchAll(/<svg\b[^>]*>/g)].map(tag => tag[0].match(/\bwidth="([^"]*)"/)?.[1]);
const weights = html => [...html.matchAll(/<svg\b[^>]*>/g)].map(tag => tag[0].match(/\bweight="([^"]*)"/)?.[1] ?? '');

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK entry 58, preview on and production off', async () => {
  const previous = process.env[key];
  try {
    delete process.env[key];
    assert.equal(cityIconSizeSyncEnabled(), false);
    assert.equal(cityIconSizeSyncEnabled('true'), true);
    for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(cityIconSizeSyncEnabled(value), false);
    process.env[key] = 'true';
    assert.equal(cityIconSizeSyncEnabled(), true);
  } finally {
    if (previous === undefined) delete process.env[key]; else process.env[key] = previous;
  }
  const preview = strip(await read('wrangler.jsonc')), prod = strip(await read('wrangler.prod.jsonc'));
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(expandFlagPacks(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv(preview.vars)[key], 'true'); assert.equal(varsForProcessEnv(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv({ HARIMU_UI_PACK: preview.vars.HARIMU_UI_PACK, [key]: 'false' })[key], 'false', 'a direct string wins');
  assert.ok(FLAG_PACKS.HARIMU_UI_PACK.includes(key));
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 58);
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(57), key, 'entry 58');
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(56), ICON_SIZE_SCALE_GATE_FLAG, 'scale gate stays entry 57');
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 58/);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /#392 city icon size sync/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key));
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/city-icon-size-sync.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_CITY_ICON_SIZE_SYNC/);
  const scene = await read('app/scene-panels-v2.tsx');
  assert.match(scene, /cityIconSizeSync = cityIconSizeSyncEnabled\(\)/);
  for (const id of ['workplace', 'market', 'household', 'government']) assert.match(scene, new RegExp(`icon: cityPlaceIcon\\('${id}'\\)`));
  const untouched = `${await read('app/page.tsx')}\n${await read('app/nation-overview.tsx')}\n${await read('app/nation-panel-v2.tsx')}\n${await read('app/world-atlas.tsx')}`;
  assert.doesNotMatch(untouched, /CITY_ICON_SIZE_SYNC|cityIconSizeSync/);
  assert.match(await read('app/city-pill.tsx'), /<Icon size=\{14\} weight="bold" \/>/);
  const css = await read('app/panel-v2.css');
  const block = css.slice(css.indexOf('/* #392 UI 61'));
  assert.ok(block.startsWith('/* #392 UI 61'));
  assert.match(block, /\.panel-v2\.panel-v2-city-icon-size-sync \.panel-v2-icon svg\{flex:none;font-size:calc\(16px \* var\(--text-scale, 1\)\);width:1em;height:1em\}/);
  assert.match(block, /\.panel-v2-rows button:not\(\.market-item\)>svg,\.game-inspector-body \.panel-v2\.panel-v2-city-icon-size-sync button\.panel-v2-primary:not\(\.market-item\)>svg,\.game-inspector-body \.panel-v2\.panel-v2-city-icon-size-sync button\.panel-v2-secondary:not\(\.market-item\)>svg\{flex:none;font-size:calc\(18px \* var\(--text-scale, 1\)\);width:1em;height:1em\}/);
});

const bundle = async () => {
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [new URL('../app/scene-panels-v2.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') },
    define: { 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_PANEL': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_CITY_HEADER_STATS': '"true"' } });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
};

test('flag off matches today; flag on uses 1em on the city panel only', async () => {
  const previous = process.env[key];
  delete process.env[key];
  try {
    const mod = await bundle();
    const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
    const city = props => renderToStaticMarkup(React.createElement(mod.CitySummary, {
      cityName: 'Highspire', city: highspire, nation: aurelle, destinations: cityDestinations('aurelle', true), onView() {},
      icons: true, places: true, identity: true, openHousehold: true, taglineBeside: true, householdName: true, ...props,
    }));
    const off = city();
    process.env[key] = 'false';
    assert.equal(city(), off, 'the string "false" matches a missing flag');
    delete process.env[key];
    assert.equal(city({ cityIconSizeSync: false }), off, 'an explicit off prop matches flag off');
    process.env[key] = 'true';
    const on = city();
    delete process.env[key];
    assert.equal(city({ cityIconSizeSync: true }), on, 'an explicit on prop matches flag on');
    assert.equal(city({ cityIconSizeSync: false }), off);
    assert.match(off, /<section class="panel-v2 panel-v2-city"/);
    assert.doesNotMatch(off, /panel-v2-city-icon-size-sync|width="1em"/);
    assert.match(on, /<section class="panel-v2 panel-v2-city panel-v2-city-icon-size-sync"/);
    const offWidths = widths(off), onWidths = widths(on);
    assert.ok(offWidths.filter(w => w === '16').length >= 8, `expected header and place marks, got ${offWidths.join(',')}`);
    assert.ok(offWidths.filter(w => w === '18').length >= 6, `expected row and primary carets, got ${offWidths.join(',')}`);
    assert.ok(offWidths.includes('44'), 'the city glyph stays 44');
    assert.deepEqual(onWidths, offWidths.map(w => w === '16' || w === '18' ? '1em' : w));
    assert.deepEqual(weights(on), weights(off));
    const fold = html => html.replace(' panel-v2-city-icon-size-sync', '').replaceAll('width="1em" height="1em"', 'width="n" height="n"').replaceAll(/width="(?:16|18)" height="(?:16|18)"/g, 'width="n" height="n"');
    assert.equal(fold(on), fold(off), 'flag on changes only the sync class and the 16 and 18 sizes');
    const bare = city({ identity: false, taglineBeside: false, cityIconSizeSync: true });
    assert.match(bare, /<section class="panel-v2 panel-v2-city-icon-size-sync"/);
    assert.equal(widths(bare).includes('44'), false);
    const others = [
      mod.WorldSummary, { nation: aurelle, population: '924k', onView() {} },
      mod.HouseholdSummary, { nation: aurelle, walletMinor: 100, inventory: [], residence: 'Highspire' },
      mod.WorkSummary, { capacity: 8, contributions: 2, onMarket() {} },
      mod.MarketSummary, { nation: aurelle, walletMinor: 100, food: 1, board: true, listings: false, onHousehold() {} },
      mod.GovernmentSummary, { nation: aurelle, account: true },
    ];
    for (let i = 0; i < others.length; i += 2) {
      const html = renderToStaticMarkup(React.createElement(others[i], { ...others[i + 1], enabled: true }));
      assert.doesNotMatch(html, /panel-v2-city-icon-size-sync|width="1em"/, others[i].name);
      for (const width of widths(html)) assert.ok(width === '16' || width === '18', `${others[i].name} ${width}`);
    }
  } finally {
    if (previous === undefined) delete process.env[key]; else process.env[key] = previous;
  }
});

test('painted size at 100% text matches 16 and 18, and 150% scales only the city marks', async (t) => {
  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch { return t.skip('playwright is not installed'); }
  let browser;
  try { browser = await chromium.launch({ args: ['--disable-gpu', '--disable-dev-shm-usage'] }); }
  catch { return t.skip('headless chromium is not installed'); }
  const previous = process.env[key];
  delete process.env[key];
  try {
    const mod = await bundle();
    const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
    const html = sync => renderToStaticMarkup(React.createElement(mod.CitySummary, {
      cityName: 'Highspire', city: highspire, nation: aurelle, destinations: cityDestinations('aurelle', true), onView() {},
      icons: true, places: true, identity: true, openHousehold: true, taglineBeside: true, householdName: true, cityIconSizeSync: sync,
    }));
    const css = `${await read('app/game-shell.css')}${await read('app/panel-v2.css')}`;
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    const measure = async (sync, scale) => {
      await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><style>svg{display:block}${css}.game-inspector{position:relative;width:390px;height:auto;top:auto;bottom:auto}</style></head><body><div class="harimu-game"><aside class="game-inspector"><div class="game-inspector-body">${html(sync)}</div></aside></div></body></html>`, { waitUntil: 'load' });
      return page.evaluate(() => {
        const box = svg => { const r = svg.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
        return {
          marks: [...document.querySelectorAll('.panel-v2-icon svg')].map(box),
          carets: [...document.querySelectorAll('.panel-v2-rows button > svg, button.panel-v2-primary > svg')].map(box),
          glyph: box(document.querySelector('.panel-v2-city-mark svg')),
          color: getComputedStyle(document.querySelector('.panel-v2-icon')).color,
        };
      });
    };
    const at100 = await measure(true, 1);
    const held = await measure(false, 1);
    assert.deepEqual(at100, held, '100% text paints the same sizes and color');
    assert.ok(at100.marks.length >= 8 && at100.marks.every(box => box.w === 16 && box.h === 16));
    assert.ok(at100.carets.length >= 6 && at100.carets.every(box => box.w === 18 && box.h === 18));
    assert.deepEqual(at100.glyph, { w: 44, h: 44 });
    const at150 = await measure(true, 1.5);
    assert.ok(at150.marks.every(box => box.w === 24 && box.h === 24));
    assert.ok(at150.carets.every(box => box.w === 27 && box.h === 27));
    assert.deepEqual(at150.glyph, { w: 44, h: 44 });
    assert.equal(at150.color, at100.color);
    const { mkdirSync } = await import('node:fs');
    mkdirSync('/opt/cursor/artifacts', { recursive: true });
    await page.locator('.panel-v2').screenshot({ path: '/opt/cursor/artifacts/city-icon-size-sync-aurelle-highspire-390-scale-1.5.png' });
    await page.close();
  } finally {
    await browser.close();
    if (previous === undefined) delete process.env[key]; else process.env[key] = previous;
  }
});
