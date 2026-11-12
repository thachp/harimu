/** #392 UI 62: City header stats keep each word whole.
 *  NEXT_PUBLIC_HARIMU_CITY_HEADER_WORD_WRAP is HARIMU_UI_PACK entry 59.
 *  Preview on, production off. The class is on the City panel only while the flag is on.
 *  Flag off keeps the panel markup. The added CSS is scoped to that City class. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { cityHeaderWordWrapEnabled, CITY_HEADER_WORD_WRAP_FLAG } from '../lib/city-header-word-wrap.ts';
import { CITY_ICON_SIZE_SYNC_FLAG } from '../lib/city-icon-size-sync.ts';
import { cityDestinations } from '../lib/city-destinations.ts';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const key = CITY_HEADER_WORD_WRAP_FLAG;
const aurelle = { id: 'aurelle', name: 'Aurelle', shortName: 'Aurelle', government: 'Absolute hereditary monarchy', capital: 'Highspire', currency: 'Crown (CRN) · gold-backed', economy: 'Royal charters and fiefs', religion: 'Kinward Rite state church', population: '924k' };
const highspire = { capital: true, description: 'The royal cliff capital, connected by gilded bridges above a gorge.' };

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK entry 59, preview on and production off', async () => {
  const previous = process.env[key];
  try {
    delete process.env[key];
    assert.equal(cityHeaderWordWrapEnabled(), false);
    assert.equal(cityHeaderWordWrapEnabled('true'), true);
    for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(cityHeaderWordWrapEnabled(value), false);
    process.env[key] = 'true';
    assert.equal(cityHeaderWordWrapEnabled(), true);
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
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 68);
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(58), key, 'entry 59');
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(57), CITY_ICON_SIZE_SYNC_FLAG, 'city icon size sync stays entry 58');
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 68/);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /#392 city header word wrap/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key));
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/city-header-word-wrap.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_CITY_HEADER_WORD_WRAP/);
  const scene = await read('app/scene-panels-v2.tsx');
  assert.match(scene, /cityHeaderWordWrap = cityHeaderWordWrapEnabled\(\)/);
  assert.match(await read('app/panel-v2.tsx'), /city && cityHeaderWordWrap \? ' panel-v2-city-header-word-wrap'/);
  const untouched = `${await read('app/page.tsx')}\n${await read('app/nation-overview.tsx')}\n${await read('app/nation-overview.css')}\n${await read('app/city-pill.tsx')}`;
  assert.doesNotMatch(untouched, /CITY_HEADER_WORD_WRAP|cityHeaderWordWrap|panel-v2-city-header-word-wrap/);
  const css = await read('app/panel-v2.css');
  const block = css.slice(css.indexOf('/* #392 UI 62'), css.indexOf('/* #392 S9'));
  assert.ok(block.startsWith('/* #392 UI 62'));
  assert.match(block, /\.panel-v2\.panel-v2-city\.panel-v2-city-header-word-wrap \.panel-v2-header-stats>div\{flex:1 1 auto;min-width:min\(100%,min-content\);min-width:calc-size\(min-content,min\(100%,size\)\);max-width:100%\}/);
  assert.match(block, /\.panel-v2\.panel-v2-city\.panel-v2-city-header-word-wrap \.panel-v2-header-stats :is\(dt,dd,small\)\{overflow-wrap:normal;word-break:normal;hyphens:none\}/);
  assert.doesNotMatch(block, /nation-overview|city-pill|world-atlas/);
  assert.equal(css.slice(0, css.indexOf('/* #392 UI 62')).includes('panel-v2-city-header-word-wrap'), false);
});

const bundle = async wrap => {
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [new URL('../app/scene-panels-v2.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') },
    define: {
      'process.env.NEXT_PUBLIC_HARIMU_UI_V2_PANEL': '"true"',
      'process.env.NEXT_PUBLIC_HARIMU_CITY_HEADER_STATS': '"true"',
      'process.env.NEXT_PUBLIC_HARIMU_CITY_HEADER_WORD_WRAP': wrap === undefined ? 'undefined' : JSON.stringify(wrap),
    } });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
};

test('flag off markup is unchanged; flag on adds the class only on the City panel', async () => {
  const offMod = await bundle('false'), onMod = await bundle('true'), missing = await bundle(undefined);
  const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
  const city = (mod, props = {}) => renderToStaticMarkup(React.createElement(mod.CitySummary, {
    cityName: 'Highspire', city: highspire, nation: aurelle, destinations: cityDestinations('aurelle', true), onView() {},
    icons: true, places: true, identity: true, openHousehold: true, taglineBeside: true, householdName: true, cityIconSizeSync: false, ...props,
  }));
  const off = city(offMod), on = city(onMod), unset = city(missing);
  assert.equal(off, unset, 'a missing flag matches flag off');
  assert.equal(city(onMod, { cityHeaderWordWrap: false }), off, 'the prop turns the class off');
  assert.equal(city(offMod, { cityHeaderWordWrap: false }), off);
  assert.match(off, /<section class="panel-v2 panel-v2-city"/);
  assert.doesNotMatch(off, /panel-v2-city-header-word-wrap/);
  assert.match(on, /<section class="panel-v2 panel-v2-city panel-v2-city-header-word-wrap"/);
  assert.equal(on.replace(' panel-v2-city-header-word-wrap', ''), off, 'flag on adds only the class');
  assert.match(city(offMod, { cityHeaderWordWrap: true }), /panel-v2-city-header-word-wrap/, 'the prop turns the class on');
  const bare = city(onMod, { identity: false, taglineBeside: false });
  assert.match(bare, /<section class="panel-v2"/);
  assert.doesNotMatch(bare, /panel-v2-city-header-word-wrap|panel-v2-city /);
  const others = [
    onMod.WorldSummary, { nation: aurelle, population: '924k', onView() {} },
    onMod.HouseholdSummary, { nation: aurelle, walletMinor: 100, inventory: [], residence: 'Highspire' },
    onMod.WorkSummary, { capacity: 8, contributions: 2, onMarket() {} },
    onMod.MarketSummary, { nation: aurelle, walletMinor: 100, food: 1, board: true, listings: false, onHousehold() {} },
    onMod.GovernmentSummary, { nation: aurelle, account: true },
  ];
  for (let i = 0; i < others.length; i += 2) {
    const html = renderToStaticMarkup(React.createElement(others[i], { ...others[i + 1], enabled: true }));
    assert.doesNotMatch(html, /panel-v2-city-header-word-wrap|panel-v2-city/, others[i].name);
  }
});

test('painted header at 390px and 150% text keeps each header word on one line', async (t) => {
  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch { return t.skip('playwright is not installed'); }
  let browser;
  try { browser = await chromium.launch({ args: ['--disable-gpu', '--disable-dev-shm-usage'] }); }
  catch { return t.skip('headless chromium is not installed'); }
  try {
    const onMod = await bundle('true');
    const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
    const html = renderToStaticMarkup(React.createElement(onMod.CitySummary, {
      cityName: 'Highspire', city: highspire, nation: aurelle, destinations: cityDestinations('aurelle', true), onView() {},
      icons: true, places: true, identity: true, openHousehold: true, taglineBeside: true, householdName: true, cityHeaderWordWrap: true,
    }));
    const css = `${await read('app/game-shell.css')}${await read('app/panel-v2.css')}`;
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    await page.setContent(`<!doctype html><html style="--text-scale:1.5"><head><style>*{box-sizing:border-box}svg{display:block}${css}.harimu-game{height:auto;min-height:0;overflow:visible}.game-inspector{position:relative;width:390px;height:auto;top:auto;bottom:auto;overflow:visible}</style></head><body><div class="harimu-game"><aside class="game-inspector"><div class="game-inspector-body">${html}</div></aside></div></body></html>`, { waitUntil: 'load' });
    const painted = await page.evaluate(() => {
      const panel = document.querySelector('.panel-v2');
      const stats = document.querySelector('.panel-v2-header-stats');
      const words = [];
      const walker = document.createTreeWalker(stats, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.parentElement?.closest('.panel-v2-header-spoken')) continue;
        const text = node.textContent;
        for (const match of text.matchAll(/[^\s-]+/g)) {
          const range = document.createRange();
          range.setStart(node, match.index);
          range.setEnd(node, match.index + match[0].length);
          words.push({ word: match[0], lines: [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0).length });
        }
      }
      const panelBox = panel.getBoundingClientRect();
      const chips = [...stats.querySelectorAll(':scope > div')].map(chip => {
        const box = chip.getBoundingClientRect();
        const style = getComputedStyle(chip);
        return { right: box.right, minWidth: style.minWidth, maxWidth: style.maxWidth };
      });
      const sample = getComputedStyle(stats.querySelector('dt'));
      return {
        className: panel.className,
        overflowWrap: sample.overflowWrap,
        wordBreak: sample.wordBreak,
        hyphens: sample.hyphens,
        smallHyphens: getComputedStyle(stats.querySelector('small')).hyphens,
        words,
        chips,
        panelRight: panelBox.right,
        overflow: panel.scrollWidth - panel.clientWidth,
      };
    });
    assert.equal(painted.className, 'panel-v2 panel-v2-city panel-v2-city-header-word-wrap');
    assert.equal(painted.overflowWrap, 'normal');
    assert.equal(painted.wordBreak, 'normal');
    assert.equal(painted.hyphens, 'none');
    assert.equal(painted.smallHyphens, 'none');
    assert.ok(painted.words.length >= 6, painted.words.map(item => item.word).join(' '));
    for (const item of painted.words) assert.equal(item.lines, 1, item.word);
    for (const chip of painted.chips) assert.ok(chip.right <= painted.panelRight + 1, chip.minWidth);
    assert.ok(painted.overflow <= 1, `panel overflow ${painted.overflow}`);
    try {
      const [{ mkdirSync }, { tmpdir }, { join }] = await Promise.all([import('node:fs'), import('node:os'), import('node:path')]);
      const dir = process.env.HARIMU_TEST_ARTIFACTS_DIR || join(tmpdir(), 'harimu-city-header-word-wrap-392');
      mkdirSync(dir, { recursive: true });
      await page.locator('.panel-v2-city-head').screenshot({ path: join(dir, 'highspire-city-header-390-scale-1.5.png') });
    } catch { /* a missing or unwritable artifact dir must not fail the wrap checks */ }
    await page.close();
  } finally {
    await browser.close();
  }
});
