/** #392 UI 44: City panel identity. NEXT_PUBLIC_HARIMU_CITY_IDENTITY is HARIMU_UI_PACK entry 41.
 *  Preview on, production off. Flag on: a capital's subtitle is "Capital of {nation}", the city's description
 *  is the tagline, and "City life" sits above the household primary. A missing description is hidden.
 *  Flag off keeps today's title and nation-name subtitle. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { capitalCityForNation, cityForNation } from '../lib/cities.ts';
import { cityDestinations } from '../lib/city-destinations.ts';
import { cityIdentityEnabled, cityIdentityKicker, cityIdentitySubtitle, cityIdentityTagline, CITY_IDENTITY_FLAG, CITY_LIFE_KICKER } from '../lib/city-identity.ts';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const key = CITY_IDENTITY_FLAG;
const lum = hex => { const c = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722; };
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const aurelle = { id: 'aurelle', name: 'Aurelle', shortName: 'Aurelle', government: 'Absolute hereditary monarchy', capital: 'Highspire', currency: 'Crown (CRN) · gold-backed', economy: 'Royal charters and fiefs', religion: 'Kinward Rite state church', population: '924k' };
const kindle = { id: 'kindle', name: 'Kindle Republic', shortName: 'Kindle', government: 'Liberal democracy', capital: 'Forgehaven', currency: 'Spark (SPK) · free float', economy: 'Market capitalism', religion: 'Secular pluralism', population: '1.42m' };
const korund = { id: 'korund', name: 'Korund', shortName: 'Korund', government: 'Full communism; leader for life', capital: 'Stonehearth', currency: 'Labor Note (LN) + ration coupons', economy: 'Central planning', religion: 'State atheism', population: '1.31m' };
const highspire = capitalCityForNation('aurelle');
const windrest = cityForNation('aurelle', 'windrest');
const stonehearth = capitalCityForNation('korund');

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK entry 41, preview on and production off', async () => {
  const previous = process.env[key];
  try {
    delete process.env[key];
    assert.equal(cityIdentityEnabled(), false);
    assert.equal(cityIdentityEnabled('true'), true);
    for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(cityIdentityEnabled(value), false);
    process.env[key] = 'true';
    assert.equal(cityIdentityEnabled(), true);
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
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 48);
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(40), key, 'entry 41');
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 48/);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /#392 city identity/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key));
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/city-identity.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_CITY_IDENTITY/);
  assert.match(await read('app/scene-panels-v2.tsx'), /identity = cityIdentityEnabled\(\)/);
  assert.doesNotMatch(await read('app/page.tsx'), /CITY_IDENTITY|cityIdentityEnabled/);
});

test('subtitle uses Capital of the short name only for a capital, and the tagline is the real description', () => {
  assert.equal(highspire.description, 'The royal cliff capital, connected by gilded bridges above a gorge.');
  assert.equal(windrest.description, 'A northern craft city of silk looms and wind vanes.');
  assert.equal(stonehearth.description, 'The mountain capital, with a granite Presidium and public plazas.');
  assert.equal(cityIdentitySubtitle(highspire, aurelle), 'Capital of Aurelle');
  assert.equal(cityIdentitySubtitle(windrest, aurelle), 'Aurelle');
  assert.equal(cityIdentitySubtitle({ capital: false }, kindle), 'Kindle Republic');
  assert.equal(cityIdentitySubtitle({ capital: true }, kindle), 'Capital of Kindle');
  assert.equal(cityIdentitySubtitle({ capital: true }, { name: 'Kindle Republic' }), 'Capital of Kindle Republic');
  assert.equal(cityIdentitySubtitle(null, aurelle), 'Aurelle');
  assert.equal(cityIdentitySubtitle({}, aurelle), 'Aurelle');
  assert.equal(cityIdentitySubtitle(stonehearth, korund), 'Capital of Korund');
  assert.equal(cityIdentityTagline(highspire.description), highspire.description);
  assert.equal(cityIdentityTagline(`  ${windrest.description}  `), windrest.description);
  for (const missing of [null, undefined, '', '  ', 0]) assert.equal(cityIdentityTagline(missing), null);
  assert.equal(cityIdentityKicker(true), CITY_LIFE_KICKER);
  assert.equal(cityIdentityKicker(false), null);
});

const bundle = async (identity, header = 'true') => {
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [new URL('../app/scene-panels-v2.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') },
    define: { 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_PANEL': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CITY': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_CITY_PLACE_ROWS': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_CITY_HEADER_STATS': JSON.stringify(header), 'process.env.NEXT_PUBLIC_HARIMU_CITY_IDENTITY': JSON.stringify(identity) } });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
};

test('flag on shows Capital of, the real description, and City life; flag off is today\'s head', async () => {
  const offMod = await bundle('false'), onMod = await bundle('true');
  const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
  const view = (mod, city, nation, destinations = cityDestinations(nation.id, true)) => renderToStaticMarkup(React.createElement(mod.CitySummary, {
    cityName: city?.name ?? 'Highspire', city, nation, destinations, onView: () => {},
  }));
  const off = view(offMod, highspire, aurelle);
  const on = view(onMod, highspire, aurelle);
  const town = view(onMod, windrest, aurelle);
  const korundCapital = view(onMod, stonehearth, korund);
  const quiet = view(onMod, { ...highspire, description: '   ' }, aurelle);
  const unknown = view(onMod, { name: 'Highspire', description: highspire.description }, aurelle);
  const noHome = view(onMod, highspire, aurelle, cityDestinations('aurelle', true).filter(card => card.id !== 'household'));
  const named = view(onMod, { name: 'Forgehaven', capital: true, description: capitalCityForNation('kindle').description }, kindle);
  const townName = view(onMod, { name: 'Tarrek Foundry', capital: false, description: cityForNation('kindle', 'tarrek-foundry').description }, kindle);
  assert.match(off, /<header class="panel-v2-summary"><div><h2>Highspire<\/h2><p>Aurelle<\/p><\/div>/);
  assert.doesNotMatch(off, /panel-v2-city|City life|Capital of|royal cliff|panel-v2-city-mark/);
  assert.match(on, /<h2>Highspire<\/h2><p>Capital of Aurelle<\/p>/);
  assert.match(on, /class="panel-v2-city-mark" aria-hidden="true"/);
  assert.match(on, new RegExp(`class="panel-v2-city-tagline">${highspire.description}</p>`));
  assert.match(on, /class="panel-v2-city-kicker">City life<\/p>/);
  assert.match(on, /class="panel-v2-primary"/);
  assert.match(on, />Household</);
  assert.match(on, /Aurelle pop\./);
  assert.doesNotMatch(on, /Choose a place|Open household/i);
  assert.match(town, /<h2>Windrest<\/h2><p>Aurelle<\/p>/);
  assert.doesNotMatch(town, /Capital of/);
  assert.match(town, new RegExp(`class="panel-v2-city-tagline">${windrest.description}</p>`));
  assert.match(korundCapital, /<h2>Stonehearth<\/h2><p>Capital of Korund<\/p>/);
  assert.match(korundCapital, new RegExp(`class="panel-v2-city-tagline">${stonehearth.description}</p>`));
  assert.match(quiet, /Capital of Aurelle/);
  assert.doesNotMatch(quiet, /panel-v2-city-tagline/);
  assert.match(quiet, /City life/);
  assert.match(unknown, /<h2>Highspire<\/h2><p>Aurelle<\/p>/);
  assert.doesNotMatch(unknown, /Capital of/);
  assert.match(unknown, new RegExp(`class="panel-v2-city-tagline">${highspire.description}</p>`));
  assert.doesNotMatch(noHome, /City life|panel-v2-primary/);
  assert.match(named, /Capital of Kindle/);
  assert.match(townName, /<p>Kindle Republic<\/p>/);
  assert.doesNotMatch(townName, /Capital of/);
  const css = await read('app/panel-v2.css');
  const block = css.slice(css.indexOf('/* #392 UI 44'));
  assert.ok(block.length > 0);
  assert.match(block, /\.panel-v2\.panel-v2-city/);
  assert.match(block, /font-style:italic/);
  assert.match(block, /overflow-wrap:break-word/);
  assert.match(block, /word-break:normal/);
  assert.doesNotMatch(block, /overflow-wrap:anywhere|word-break:break-all/);
  assert.match(block, /width:44px/);
  assert.ok(contrast('#f1d58a', '#0b2029') >= 4.5, 'gold tagline on the inspector ground');
  assert.doesNotMatch(await read('app/nation-overview.css'), /panel-v2-city/);
  assert.doesNotMatch(await read('app/world-atlas.css'), /panel-v2-city/);
  assert.doesNotMatch(await read('app/nation-overview.tsx'), /City life|panel-v2-city-tagline/);
});
