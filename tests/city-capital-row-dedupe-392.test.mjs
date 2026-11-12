/** #392 UI 64: a capital city's fact list drops the Capital row when the header already says so.
 *  NEXT_PUBLIC_HARIMU_CITY_CAPITAL_ROW_DEDUPE is HARIMU_UI_PACK entry 61.
 *  Preview on, production off. Flag off, header stats off, or a city that is not the capital keeps the fact list. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { cityCapitalRowDedupeEnabled, CITY_CAPITAL_ROW_DEDUPE_FLAG } from '../lib/city-capital-row-dedupe.ts';
import { NATION_HEADER_ICON_SIZE_SYNC_FLAG } from '../lib/nation-header-icon-size-sync.ts';
import { cityDestinations } from '../lib/city-destinations.ts';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const key = CITY_CAPITAL_ROW_DEDUPE_FLAG;
const aurelle = { id: 'aurelle', name: 'Aurelle', shortName: 'Aurelle', government: 'Absolute hereditary monarchy', capital: 'Highspire', currency: 'Crown (CRN) · gold-backed', economy: 'Royal charters and fiefs', religion: 'Kinward Rite state church', population: '924k' };
const highspire = { capital: true, description: 'The royal cliff capital, connected by gilded bridges above a gorge.' };
const windrest = { capital: false, description: 'A northern craft city of silk looms and wind vanes.' };
const facts = html => html.match(/<dl class="panel-v2-stats">[\s\S]*?<\/dl>/)?.[0] ?? '';
const capitalRow = '<div><dt>Capital</dt><dd>Highspire</dd></div>';

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK entry 61, preview on and production off', async () => {
  const previous = process.env[key];
  try {
    delete process.env[key];
    assert.equal(cityCapitalRowDedupeEnabled(), false);
    assert.equal(cityCapitalRowDedupeEnabled('true'), true);
    for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(cityCapitalRowDedupeEnabled(value), false);
    process.env[key] = 'true';
    assert.equal(cityCapitalRowDedupeEnabled(), true);
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
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 69);
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(60), key, 'entry 61');
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(59), NATION_HEADER_ICON_SIZE_SYNC_FLAG, 'nation header icon size sync stays entry 60');
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 69/);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /#392 city capital row dedupe/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key));
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/city-capital-row-dedupe.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_CITY_CAPITAL_ROW_DEDUPE/);
  const scene = await read('app/scene-panels-v2.tsx');
  assert.match(scene, /cityCapitalRowDedupe = cityCapitalRowDedupeEnabled\(\)/);
  assert.match(scene, /headerOn && cityCapitalRowDedupe && cityStatusStat\(city\)/);
  assert.doesNotMatch(await read('app/page.tsx'), /CITY_CAPITAL_ROW_DEDUPE|cityCapitalRowDedupe/);
  const others = `${await read('app/nation-overview.tsx')}\n${await read('app/nation-panel-v2.tsx')}\n${await read('app/nation-institutions.tsx')}`;
  assert.doesNotMatch(others, /CITY_CAPITAL_ROW_DEDUPE|cityCapitalRowDedupe/);
});

const bundle = async ({ dedupe, header }) => {
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [new URL('../app/scene-panels-v2.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') },
    define: {
      'process.env.NEXT_PUBLIC_HARIMU_UI_V2_PANEL': '"true"',
      'process.env.NEXT_PUBLIC_HARIMU_CITY_HEADER_STATS': header === undefined ? 'undefined' : JSON.stringify(header),
      'process.env.NEXT_PUBLIC_HARIMU_CITY_CAPITAL_ROW_DEDUPE': dedupe === undefined ? 'undefined' : JSON.stringify(dedupe),
    } });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
};

test('capital fact stays unless the flag, header stats, and a capital city are all on', async () => {
  const offMod = await bundle({ dedupe: 'false', header: 'true' });
  const onMod = await bundle({ dedupe: 'true', header: 'true' });
  const missing = await bundle({ dedupe: undefined, header: 'true' });
  const headerOff = await bundle({ dedupe: 'true', header: 'false' });
  const headerOffBase = await bundle({ dedupe: 'false', header: 'false' });
  const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
  const city = (mod, props = {}, cityName = 'Highspire', place = highspire) => renderToStaticMarkup(React.createElement(mod.CitySummary, {
    cityName, city: place, nation: aurelle, destinations: cityDestinations('aurelle', true), onView() {}, ...props,
  }));
  const off = city(offMod), on = city(onMod), unset = city(missing);
  const onlyCapital = `<dl class="panel-v2-stats">${capitalRow}</dl>`;
  assert.equal(off, unset, 'a missing flag matches flag off');
  assert.equal(facts(off), onlyCapital);
  assert.equal(off.replace(onlyCapital, ''), on, 'flag on drops only the Capital fact');
  assert.equal(facts(on), '');
  assert.match(on, /<span>Status<\/span><\/dt><dd>Capital<\/dd>/);
  assert.equal(city(onMod, { cityCapitalRowDedupe: false }), off, 'the prop turns the row back on');
  assert.equal(city(offMod, { cityCapitalRowDedupe: true }), on, 'the prop turns the row off');
  const townOff = city(offMod, {}, 'Windrest', windrest), townOn = city(onMod, {}, 'Windrest', windrest);
  assert.equal(townOn, townOff, 'a city that is not the capital keeps the fact list');
  assert.match(facts(townOn), new RegExp(capitalRow));
  assert.doesNotMatch(townOn, /<dt>Status<\/dt>/);
  const namedCapital = city(onMod, {}, 'Windrest', { capital: true });
  const namedOff = city(offMod, {}, 'Windrest', { capital: true });
  assert.equal(namedOff.replace(onlyCapital, ''), namedCapital, 'cityStatusStat decides, even when the title differs from the capital name');
  assert.equal(facts(namedCapital), '');
  const sameName = city(onMod, {}, 'Highspire', { capital: false });
  assert.match(facts(sameName), new RegExp(capitalRow), 'a matching city name with capital false keeps the row');
  assert.equal(city(headerOff), city(headerOffBase), 'header stats off keeps the fact list');
  assert.match(facts(city(headerOff)), /<dt>Status<\/dt><dd>Capital<\/dd>/);
  assert.match(facts(city(headerOff)), new RegExp(capitalRow));
  const gov = props => renderToStaticMarkup(React.createElement(onMod.GovernmentSummary, { nation: aurelle, account: true, ...props }));
  const govOff = renderToStaticMarkup(React.createElement(offMod.GovernmentSummary, { nation: aurelle, account: true }));
  assert.equal(gov(), govOff);
  assert.match(gov(), new RegExp(capitalRow));
  const world = mod => renderToStaticMarkup(React.createElement(mod.WorldSummary, { nation: aurelle, population: '924k', onView() {} }));
  assert.equal(world(onMod), world(offMod));
  assert.match(world(onMod), new RegExp(capitalRow));
});

test('painted capital and non-capital panels at 390px', async (t) => {
  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch { return t.skip('playwright is not installed'); }
  let browser;
  try { browser = await chromium.launch({ args: ['--disable-gpu', '--disable-dev-shm-usage'] }); }
  catch { return t.skip('headless chromium is not installed'); }
  try {
    const onMod = await bundle({ dedupe: 'true', header: 'true' });
    const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
    const css = `${await read('app/game-shell.css')}${await read('app/panel-v2.css')}`;
    const paint = async (cityName, place, file) => {
      const html = renderToStaticMarkup(React.createElement(onMod.CitySummary, {
        cityName, city: place, nation: aurelle, destinations: cityDestinations('aurelle', true), onView() {},
        icons: true, places: true, identity: true, openHousehold: true, taglineBeside: true, cityCapitalRowDedupe: true,
      }));
      const page = await browser.newPage({ viewport: { width: 390, height: 1200 } });
      await page.setContent(`<!doctype html><html><head><style>*{box-sizing:border-box}svg{display:block}${css}.harimu-game{height:auto;min-height:0;overflow:visible}.game-inspector{position:relative;width:390px;height:auto;top:auto;bottom:auto;overflow:visible}</style></head><body><div class="harimu-game"><aside class="game-inspector"><div class="game-inspector-body">${html}</div></aside></div></body></html>`, { waitUntil: 'load' });
      assert.equal(await page.locator('.panel-v2-stats dt', { hasText: /^Capital$/ }).count(), place.capital ? 0 : 1);
      const head = await page.locator('.panel-v2-summary').innerText();
      if (place.capital) assert.match(head, /Capital of Aurelle/);
      else assert.match(await page.locator('.panel-v2-stats').innerText(), /Capital\s+Highspire/);
      try {
        const [{ mkdirSync }, { tmpdir }, { join }] = await Promise.all([import('node:fs'), import('node:os'), import('node:path')]);
        const dir = process.env.HARIMU_TEST_ARTIFACTS_DIR || join(tmpdir(), 'harimu-city-capital-row-dedupe-392');
        if (dir === '/opt' || dir.startsWith('/opt/')) throw new Error('artifact dir');
        mkdirSync(dir, { recursive: true });
        await page.locator('.game-inspector').screenshot({ path: join(dir, file) });
      } catch { /* a missing or unwritable artifact dir must not fail the fact checks */ }
      await page.close();
    };
    await paint('Highspire', highspire, 'highspire-city-390.png');
    await paint('Windrest', windrest, 'windrest-city-390.png');
  } finally {
    await browser.close();
  }
});
