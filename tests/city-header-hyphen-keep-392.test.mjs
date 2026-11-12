/** #392 UI 65: City header chip details keep a hyphenated token on one line.
 *  NEXT_PUBLIC_HARIMU_CITY_HEADER_HYPHEN_KEEP is HARIMU_UI_PACK entry 62. Preview on, production off. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { cityHeaderHyphenKeepEnabled, CITY_HEADER_HYPHEN_KEEP_FLAG } from '../lib/city-header-hyphen-keep.ts';
import { CITY_CAPITAL_ROW_DEDUPE_FLAG } from '../lib/city-capital-row-dedupe.ts';
import { cityDestinations } from '../lib/city-destinations.ts';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const key = CITY_HEADER_HYPHEN_KEEP_FLAG;
const aurelle = { id: 'aurelle', name: 'Aurelle', shortName: 'Aurelle', government: 'Absolute hereditary monarchy', capital: 'Highspire', currency: 'Crown (CRN) · gold-backed', economy: 'Royal charters and fiefs', religion: 'Kinward Rite state church', population: '924k' };
const kindle = { id: 'kindle', name: 'Kindle Republic', shortName: 'Kindle', government: 'Liberal democracy', capital: 'Forgehaven', currency: 'Spark (SPK) · free float', economy: 'Market capitalism', religion: 'Secular pluralism', population: '1.42m' };
const highspire = { capital: true, description: 'The royal cliff capital, connected by gilded bridges above a gorge.' };
const forgehaven = { capital: true, description: 'The volcanic plateau capital, with Assembly architecture and financial towers.' };

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK entry 62, preview on and production off', async () => {
  const previous = process.env[key];
  try {
    delete process.env[key];
    assert.equal(cityHeaderHyphenKeepEnabled(), false);
    assert.equal(cityHeaderHyphenKeepEnabled('true'), true);
    for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(cityHeaderHyphenKeepEnabled(value), false);
    process.env[key] = 'true';
    assert.equal(cityHeaderHyphenKeepEnabled(), true);
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
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 71);
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(61), key, 'entry 62');
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(60), CITY_CAPITAL_ROW_DEDUPE_FLAG, 'city capital row dedupe stays entry 61');
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 71/);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /#392 city header hyphen keep/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key));
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/city-header-hyphen-keep.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_CITY_HEADER_HYPHEN_KEEP/);
  const scene = await read('app/scene-panels-v2.tsx');
  assert.match(scene, /cityHeaderHyphenKeep = cityHeaderHyphenKeepEnabled\(\)/);
  assert.match(await read('app/panel-v2.tsx'), /city && cityHeaderHyphenKeep \? ' panel-v2-city-header-hyphen-keep'/);
  const untouched = `${await read('app/page.tsx')}\n${await read('app/nation-overview.tsx')}\n${await read('app/nation-overview.css')}\n${await read('app/city-pill.tsx')}`;
  assert.doesNotMatch(untouched, /CITY_HEADER_HYPHEN_KEEP|cityHeaderHyphenKeep|panel-v2-city-header-hyphen-keep/);
  const css = await read('app/panel-v2.css');
  const block = css.slice(css.indexOf('/* #392 UI 65'), css.indexOf('/* #392 S9'));
  assert.ok(block.startsWith('/* #392 UI 65'));
  assert.match(block, /\.panel-v2\.panel-v2-city\.panel-v2-city-header-hyphen-keep \.panel-v2-header-stats small\{white-space:nowrap\}/);
  assert.doesNotMatch(block, /nation-overview|city-pill|world-atlas/);
  assert.equal(css.slice(0, css.indexOf('/* #392 UI 65')).includes('panel-v2-city-header-hyphen-keep'), false);
});

const bundle = async (keep, wrap = 'true') => {
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [new URL('../app/scene-panels-v2.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') },
    define: {
      'process.env.NEXT_PUBLIC_HARIMU_UI_V2_PANEL': '"true"',
      'process.env.NEXT_PUBLIC_HARIMU_CITY_HEADER_STATS': '"true"',
      'process.env.NEXT_PUBLIC_HARIMU_CITY_HEADER_WORD_WRAP': JSON.stringify(wrap),
      'process.env.NEXT_PUBLIC_HARIMU_CITY_HEADER_HYPHEN_KEEP': keep === undefined ? 'undefined' : JSON.stringify(keep),
    } });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
};

test('flag off markup is unchanged; flag on adds the class only on the City panel', async () => {
  const offMod = await bundle('false'), onMod = await bundle('true'), missing = await bundle(undefined);
  const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
  const city = (mod, props = {}, nation = aurelle, cityName = 'Highspire', place = highspire) => renderToStaticMarkup(React.createElement(mod.CitySummary, {
    cityName, city: place, nation, destinations: cityDestinations(nation.id, true), onView() {},
    icons: true, places: true, identity: true, openHousehold: true, taglineBeside: true, householdName: true, cityIconSizeSync: false, ...props,
  }));
  const off = city(offMod), on = city(onMod), unset = city(missing);
  assert.equal(off, unset, 'a missing flag matches flag off');
  assert.equal(city(onMod, { cityHeaderHyphenKeep: false }), off, 'the prop turns the class off');
  assert.match(off, /<section class="panel-v2 panel-v2-city panel-v2-city-header-word-wrap"/);
  assert.match(off, /CRN · gold-backed/);
  assert.doesNotMatch(off, /panel-v2-city-header-hyphen-keep/);
  assert.match(on, /<section class="panel-v2 panel-v2-city panel-v2-city-header-word-wrap panel-v2-city-header-hyphen-keep"/);
  assert.equal(on.replace(' panel-v2-city-header-hyphen-keep', ''), off, 'flag on adds only the class');
  assert.match(city(offMod, { cityHeaderHyphenKeep: true }), /panel-v2-city-header-hyphen-keep/, 'the prop turns the class on');
  const bare = city(onMod, { identity: false, taglineBeside: false });
  assert.match(bare, /<section class="panel-v2"/);
  assert.doesNotMatch(bare, /panel-v2-city-header-hyphen-keep|panel-v2-city /);
  const others = [
    onMod.WorldSummary, { nation: aurelle, population: '924k', onView() {} },
    onMod.HouseholdSummary, { nation: aurelle, walletMinor: 100, inventory: [], residence: 'Highspire' },
    onMod.WorkSummary, { capacity: 8, contributions: 2, onMarket() {} },
    onMod.MarketSummary, { nation: aurelle, walletMinor: 100, food: 1, board: true, listings: false, onHousehold() {} },
    onMod.GovernmentSummary, { nation: aurelle, account: true },
  ];
  for (let i = 0; i < others.length; i += 2) {
    const html = renderToStaticMarkup(React.createElement(others[i], { ...others[i + 1], enabled: true }));
    assert.doesNotMatch(html, /panel-v2-city-header-hyphen-keep|panel-v2-city/, others[i].name);
  }
});

test('painted header keeps gold-backed on one line at 390px and 320px, and other currencies stay inside', async (t) => {
  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch { return t.skip('playwright is not installed'); }
  let browser;
  try { browser = await chromium.launch({ args: ['--disable-gpu', '--disable-dev-shm-usage'] }); }
  catch { return t.skip('headless chromium is not installed'); }
  try {
    const onMod = await bundle('true', 'true');
    const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
    const css = `${await read('app/game-shell.css')}${await read('app/panel-v2.css')}`;
    const markup = (nation, cityName, place) => renderToStaticMarkup(React.createElement(onMod.CitySummary, {
      cityName, city: place, nation, destinations: cityDestinations(nation.id, true), onView() {},
      icons: true, places: true, identity: true, openHousehold: true, taglineBeside: true, householdName: true, cityIconSizeSync: false, cityHeaderWordWrap: true, cityHeaderHyphenKeep: true,
    }));
    const cases = [
      { name: 'highspire-390-scale-1.5.png', width: 390, scale: '1.5', nation: aurelle, cityName: 'Highspire', place: highspire, token: 'gold-backed' },
      { name: 'highspire-320.png', width: 320, scale: '', nation: aurelle, cityName: 'Highspire', place: highspire, token: 'gold-backed' },
      { name: 'forgehaven-390-scale-1.5.png', width: 390, scale: '1.5', nation: kindle, cityName: 'Forgehaven', place: forgehaven, token: '' },
    ];
    for (const spec of cases) {
      const html = markup(spec.nation, spec.cityName, spec.place);
      const page = await browser.newPage({ viewport: { width: spec.width, height: 900 } });
      const scaleStyle = spec.scale ? `--text-scale:${spec.scale}` : '';
      await page.setContent(`<!doctype html><html style="${scaleStyle}"><head><style>*{box-sizing:border-box}svg{display:block}${css}.harimu-game{height:auto;min-height:0;overflow:visible}.game-inspector{position:relative;width:${spec.width}px;height:auto;top:auto;bottom:auto;overflow:visible}</style></head><body><div class="harimu-game"><aside class="game-inspector"><div class="game-inspector-body">${html}</div></aside></div></body></html>`, { waitUntil: 'load' });
      const painted = await page.evaluate(token => {
        const panel = document.querySelector('.panel-v2');
        const stats = document.querySelector('.panel-v2-header-stats');
        const hits = [];
        if (token) {
          const walker = document.createTreeWalker(stats, NodeFilter.SHOW_TEXT);
          let node;
          while ((node = walker.nextNode())) {
            const text = node.textContent ?? '';
            const index = text.indexOf(token);
            if (index < 0) continue;
            const range = document.createRange();
            range.setStart(node, index);
            range.setEnd(node, index + token.length);
            const rects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0);
            hits.push({ lines: new Set(rects.map(rect => rect.top)).size, rects: rects.length });
          }
        }
        const panelBox = panel.getBoundingClientRect();
        const chips = [...stats.querySelectorAll(':scope > div')].map(chip => chip.getBoundingClientRect().right);
        const small = stats.querySelector('small');
        return { className: panel.className, whiteSpace: getComputedStyle(small).whiteSpace, detail: small.textContent, hits, chips, panelRight: panelBox.right, overflow: panel.scrollWidth - panel.clientWidth };
      }, spec.token);
      assert.equal(painted.className, 'panel-v2 panel-v2-city panel-v2-city-header-word-wrap panel-v2-city-header-hyphen-keep', spec.cityName);
      assert.equal(painted.whiteSpace, 'nowrap', spec.cityName);
      if (spec.token) {
        assert.equal(painted.hits.length, 1, spec.cityName);
        assert.equal(painted.hits[0].lines, 1, spec.token);
        assert.ok(painted.detail.includes(spec.token), painted.detail);
      }
      for (const right of painted.chips) assert.ok(right <= painted.panelRight + 1, `${spec.cityName} chip ${right} panel ${painted.panelRight}`);
      assert.ok(painted.overflow <= 1, `${spec.cityName} panel overflow ${painted.overflow}`);
      try {
        const [{ mkdirSync }, os, { join }] = await Promise.all([import('node:fs'), import('node:os'), import('node:path')]);
        const dir = process.env.HARIMU_TEST_ARTIFACTS_DIR || join(os.tmpdir(), 'harimu-city-header-hyphen-keep-392');
        mkdirSync(dir, { recursive: true });
        await page.locator('.panel-v2-city-head').screenshot({ path: join(dir, spec.name) });
      } catch { /* a missing or unwritable artifact dir must not fail the wrap checks */ }
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
