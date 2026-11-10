/** #392 UI 40: City panel header stats. NEXT_PUBLIC_HARIMU_CITY_HEADER_STATS is HARIMU_UI_PACK entry 38.
 *  Preview on, production off. Flag on shows Population, Status and Currency from nation and city data.
 *  A missing value is left out, and the row is left out when all three are missing. Flag off is today's header. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { cityDestinations } from '../lib/city-destinations.ts';
import { cityCurrencyChip, cityHeaderStats, cityHeaderStatsEnabled, CITY_HEADER_STATS_FLAG, formatCityPopulation } from '../lib/city-header-stats.ts';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const key = CITY_HEADER_STATS_FLAG;
const aurelle = { id: 'aurelle', name: 'Aurelle', government: 'Absolute hereditary monarchy', capital: 'Highspire', currency: 'Crown (CRN) · gold-backed', economy: 'Royal charters and fiefs', religion: 'Kinward Rite state church', population: '924k' };
const lum = hex => { const c = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722; };
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const header = html => html.match(/<dl class="panel-v2-header-stats">[\s\S]*?<\/dl>/)?.[0] ?? '';
const labels = html => [...html.matchAll(/<dt>(?:<span class="panel-v2-icon" aria-hidden="true">[\s\S]*?<\/span>)?([^<]*)<\/dt><dd>([^<]*)<\/dd>/g)].map(m => [m[1], m[2]]);

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK entry 38, preview on and production off', async () => {
  const previous = process.env[key];
  try {
    delete process.env[key];
    assert.equal(cityHeaderStatsEnabled(), false);
    assert.equal(cityHeaderStatsEnabled('true'), true);
    for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(cityHeaderStatsEnabled(value), false);
    process.env[key] = 'true';
    assert.equal(cityHeaderStatsEnabled(), true);
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
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 38);
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(37), key, 'entry 38');
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(-1), key);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 38/);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /#392 city header stats/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key));
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/city-header-stats.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_CITY_HEADER_STATS/);
  assert.match(await read('app/scene-panels-v2.tsx'), /headerStats = cityHeaderStatsEnabled\(\)/);
  assert.doesNotMatch(await read('app/page.tsx'), /CITY_HEADER_STATS|cityHeaderStatsEnabled/);
});

test('chips use real nation and city fields, group a count, and hide a missing one', () => {
  assert.equal(formatCityPopulation(72000), '72,000');
  assert.equal(formatCityPopulation('72000'), '72,000');
  assert.equal(formatCityPopulation('924k'), '924k');
  assert.equal(formatCityPopulation('1.42m'), '1.42m');
  for (const missing of [null, undefined, '', '  ', Number.NaN, -1]) assert.equal(formatCityPopulation(missing), null);
  assert.equal(cityCurrencyChip('Crown (CRN) · gold-backed'), 'Crown');
  assert.equal(cityCurrencyChip('Spark (SPK) · free float'), 'Spark');
  assert.equal(cityCurrencyChip('CRN'), 'CRN');
  assert.equal(cityCurrencyChip(' (CRN)'), 'CRN');
  assert.equal(cityCurrencyChip('  · gold'), null);
  assert.deepEqual(cityHeaderStats({ city: { capital: true }, population: aurelle.population, currency: aurelle.currency }), [
    { label: 'Population', value: '924k' }, { label: 'Status', value: 'Capital' }, { label: 'Currency', value: 'Crown' },
  ]);
  assert.deepEqual(cityHeaderStats({ city: { capital: true }, population: 72000, currency: aurelle.currency }).map(stat => stat.value), ['72,000', 'Capital', 'Crown']);
  assert.deepEqual(cityHeaderStats({ city: { capital: false }, population: aurelle.population, currency: aurelle.currency }).map(stat => stat.label), ['Population', 'Currency']);
  assert.deepEqual(cityHeaderStats({ city: { capital: true }, currency: aurelle.currency }).map(stat => stat.label), ['Status', 'Currency']);
  assert.deepEqual(cityHeaderStats({ city: { capital: false }, population: '  ', currency: '' }), []);
});

const bundle = async flag => {
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [new URL('../app/scene-panels-v2.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') },
    define: { 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_PANEL': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CITY': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_CITY_PLACE_ROWS': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_CITY_HEADER_STATS': JSON.stringify(flag) } });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
};

test('flag on shows the chips with real values and hides a missing one; flag off shows no chips', async () => {
  const offMod = await bundle('false'), onMod = await bundle('true');
  const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
  const view = (mod, city, nation = aurelle) => renderToStaticMarkup(React.createElement(mod.CitySummary, {
    cityName: city.capital ? 'Highspire' : 'Windrest', city, nation, destinations: cityDestinations('aurelle', true), onView: () => {},
  }));
  const off = view(offMod, { capital: true });
  const on = view(onMod, { capital: true });
  const town = view(onMod, { capital: false });
  const noPeople = view(onMod, { capital: true }, { ...aurelle, population: ' ' });
  const none = view(onMod, { capital: false }, { ...aurelle, population: '', currency: '' });
  assert.match(off, /<header class="panel-v2-summary"><div><h2>Highspire<\/h2><p>Aurelle<\/p><\/div><\/header>/);
  assert.equal(header(off), '');
  assert.doesNotMatch(off, /panel-v2-header-stats/);
  assert.match(on, /<header class="panel-v2-summary"><div><h2>Highspire<\/h2><p>Aurelle<\/p><\/div><dl class="panel-v2-header-stats">/);
  assert.deepEqual(labels(header(on)), [['Population', '924k'], ['Status', 'Capital'], ['Currency', 'Crown']]);
  assert.match(header(on), /aria-hidden="true"/);
  assert.deepEqual(labels(header(town)), [['Population', '924k'], ['Currency', 'Crown']]);
  assert.doesNotMatch(header(town), /Status/);
  assert.deepEqual(labels(header(noPeople)), [['Status', 'Capital'], ['Currency', 'Crown']]);
  assert.equal(header(none), '');
  assert.match(on, /<dt>Currency<\/dt><dd>Crown \(CRN\) · gold-backed<\/dd>/);
  assert.match(on, /<dt>Capital<\/dt><dd>Highspire<\/dd>/);
  const css = await read('app/panel-v2.css');
  const chipCss = css.slice(css.indexOf('/* #392 city header stats'), css.indexOf('.panel-v2 dl.panel-v2-stats'));
  assert.match(chipCss, /flex-wrap:wrap/);
  assert.match(chipCss, /overflow-wrap:anywhere/);
  assert.match(chipCss, /white-space:normal/);
  assert.doesNotMatch(chipCss, /white-space:nowrap|overflow-x:auto|overflow-x:scroll/);
  assert.ok(contrast('#f1d58a', '#071820') >= 4.5, 'label on the chip');
  assert.ok(contrast('#f3ecd6', '#071820') >= 4.5, 'value on the chip');
  assert.match(await read('app/nation-accent.css'), /\.harimu-game\[data-nation-accent\] \.panel-v2-header-stats>div\{border-color:var\(--crest-accent\)\}/);
});
