/** #392 UI 48: City tagline beside the title. NEXT_PUBLIC_HARIMU_CITY_TAGLINE_BESIDE is HARIMU_UI_PACK entry 45.
 *  Preview on, production off. Flag on: the city's own description sits to the right of the title, gold italic, wrapping on words.
 *  A missing or blank description is hidden. Flag off keeps today's head, including the tagline under the title when city identity is on. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { capitalCityForNation, cityForNation } from '../lib/cities.ts';
import { cityDestinations } from '../lib/city-destinations.ts';
import { cityTaglineBesideEnabled, CITY_TAGLINE_BESIDE_FLAG } from '../lib/city-tagline-beside.ts';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const key = CITY_TAGLINE_BESIDE_FLAG;
const aurelle = { id: 'aurelle', name: 'Aurelle', shortName: 'Aurelle', government: 'Absolute hereditary monarchy', capital: 'Highspire', currency: 'Crown (CRN) · gold-backed', economy: 'Royal charters and fiefs', religion: 'Kinward Rite state church', population: '924k' };
const highspire = capitalCityForNation('aurelle');
const windrest = cityForNation('aurelle', 'windrest');

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK entry 45, preview on and production off', async () => {
  const previous = process.env[key];
  try {
    delete process.env[key];
    assert.equal(cityTaglineBesideEnabled(), false);
    assert.equal(cityTaglineBesideEnabled('true'), true);
    for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(cityTaglineBesideEnabled(value), false);
    process.env[key] = 'true';
    assert.equal(cityTaglineBesideEnabled(), true);
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
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 47);
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(44), key, 'entry 45');
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 47/);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /#392 city tagline beside/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key));
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/city-tagline-beside.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_CITY_TAGLINE_BESIDE/);
  assert.match(await read('app/scene-panels-v2.tsx'), /taglineBeside = cityTaglineBesideEnabled\(\)/);
  assert.doesNotMatch(await read('app/page.tsx'), /CITY_TAGLINE_BESIDE|cityTaglineBesideEnabled/);
});

const bundle = async (beside, identity = 'true') => {
  const { build } = await import('esbuild');
  const define = { 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_PANEL': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CITY': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_CITY_PLACE_ROWS': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_CITY_HEADER_STATS': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_CITY_IDENTITY': JSON.stringify(identity), 'process.env.NEXT_PUBLIC_HARIMU_CITY_OPEN_HOUSEHOLD': '"false"' };
  if (beside !== undefined) define['process.env.NEXT_PUBLIC_HARIMU_CITY_TAGLINE_BESIDE'] = JSON.stringify(beside);
  const out = await build({ entryPoints: [new URL('../app/scene-panels-v2.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') }, define });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
};

test('flag on places the real description to the right of the title; a blank one is hidden; flag off is unchanged', async () => {
  const previous = process.env[key];
  delete process.env[key];
  try {
    const onMod = await bundle('true'), offMod = await bundle('false'), missingMod = await bundle(undefined), quietIdentity = await bundle('true', 'false');
    const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
    const view = (mod, city, extra = {}) => renderToStaticMarkup(React.createElement(mod.CitySummary, {
      cityName: city?.name ?? 'Highspire', city, nation: aurelle, destinations: cityDestinations('aurelle', true), onView: () => {}, ...extra,
    }));
    const on = view(onMod, highspire), off = view(offMod, highspire), missing = view(missingMod, highspire);
    const town = view(onMod, windrest), townOff = view(offMod, windrest);
    const quiet = view(onMod, { ...highspire, description: '   ' });
    const quietNull = view(onMod, { ...highspire, description: null });
    const quietOff = view(offMod, { ...highspire, description: '   ' });
    const noIdentity = view(quietIdentity, highspire);
    const noIdentityOff = view(await bundle('false', 'false'), highspire);
    const head = html => html.match(/<header[^>]*>[\s\S]*?<\/header>/)?.[0] ?? '';
    const beside = ' panel-v2-city-head-beside';
    assert.equal(missing, off, 'a missing flag matches flag off');
    assert.equal(on.replaceAll(beside, ''), off, 'flag on adds only the beside class');
    assert.match(head(on), new RegExp(`<div><h2>Highspire</h2><p>Capital of Aurelle</p></div><p class="panel-v2-city-tagline">${highspire.description}</p>`));
    assert.match(head(on), /class="panel-v2-summary panel-v2-city-head panel-v2-city-head-beside"/);
    assert.match(head(off), new RegExp(`<div><h2>Highspire</h2><p>Capital of Aurelle</p></div><p class="panel-v2-city-tagline">${highspire.description}</p>`));
    assert.match(head(off), /class="panel-v2-summary panel-v2-city-head"/);
    assert.doesNotMatch(off, /panel-v2-city-head-beside/);
    assert.equal(town.replaceAll(beside, ''), townOff);
    assert.match(head(town), new RegExp(`<div><h2>Windrest</h2><p>Aurelle</p></div><p class="panel-v2-city-tagline">${windrest.description}</p>`));
    assert.doesNotMatch(town, /Capital of/);
    for (const hidden of [quiet, quietNull, quietOff]) {
      assert.match(hidden, /<h2>Highspire<\/h2>/);
      assert.doesNotMatch(hidden, /panel-v2-city-tagline|panel-v2-city-head-beside/);
    }
    assert.equal(quiet, quietOff);
    assert.equal(noIdentity, noIdentityOff);
    assert.doesNotMatch(noIdentity, /panel-v2-city-tagline|panel-v2-city-head-beside|Capital of/);
    const world = mod => renderToStaticMarkup(React.createElement(mod.WorldSummary, { nation: aurelle, population: '924k', onView() {} }));
    assert.equal(world(onMod), world(offMod));
    const css = await read('app/panel-v2.css');
    const block = css.slice(css.indexOf('/* #392 UI 48'));
    assert.ok(block.length > 0);
    const shared = css.match(/\.panel-v2\.panel-v2-city p\.panel-v2-city-tagline\{[^}]*\}/)?.[0] ?? '';
    assert.match(shared, /#f1d58a/);
    assert.match(shared, /font-style:italic/);
    assert.match(shared, /Georgia/);
    assert.match(shared, /line-height:1\.35/);
    assert.match(shared, /overflow-wrap:break-word/);
    assert.match(shared, /word-break:normal/);
    assert.doesNotMatch(shared, /text-align/, 'flag-off tagline color and wrap stay on the shared rule');
    assert.match(block, /\.panel-v2-city-head-beside p\.panel-v2-city-tagline\{[^}]*text-align:right/);
    assert.match(block, /@media \(max-width:390px\)/);
    assert.match(block, /grid-column:1 \/ -1/);
    assert.doesNotMatch(block, /overflow-wrap:\s*anywhere|word-break:\s*break-all/);
    assert.doesNotMatch(css.slice(0, css.indexOf('/* #392 UI 48')), /panel-v2-city-head-beside/);
  } finally {
    if (previous === undefined) delete process.env[key]; else process.env[key] = previous;
  }
});
