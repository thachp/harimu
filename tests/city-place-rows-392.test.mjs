/** #392 (from S7/#808): City side-panel rows match the map place pills.
 *  NEXT_PUBLIC_HARIMU_CITY_PLACE_ROWS is a HARIMU_UI_PACK key, preview on, production off.
 *  Flag off keeps the Household primary and the destination-card rows.
 *  Flag on keeps that primary after the place rows. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { cityDestinations } from '../lib/city-destinations.ts';
import { createCityWorld } from '../lib/game-art.ts';
import { cityLocationOrder, cityPlaceIds, cityPlaceLabel, cityPlaceRowsEnabled, cityPlaces, CITY_PLACE_ROWS_FLAG } from '../lib/city-places.ts';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const key = CITY_PLACE_ROWS_FLAG;
const nation = { id: 'kindle', name: 'Kindle Republic', government: 'G', capital: 'Forgehaven', currency: 'Spark', economy: 'E', religion: 'R' };

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK, preview on and production off', async () => {
  assert.equal(cityPlaceRowsEnabled('true'), true);
  for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(cityPlaceRowsEnabled(value), false);
  const preview = strip(await read('wrangler.jsonc')), prod = strip(await read('wrangler.prod.jsonc'));
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(expandFlagPacks(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv(preview.vars)[key], 'true'); assert.equal(varsForProcessEnv(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv({ HARIMU_UI_PACK: preview.vars.HARIMU_UI_PACK, [key]: 'false' })[key], 'false', 'a direct string wins');
  assert.ok(FLAG_PACKS.HARIMU_UI_PACK.includes(key));
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 41);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 41/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key));
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/city-places.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_CITY_PLACE_ROWS/);
  assert.match(await read('app/scene-panels-v2.tsx'), /places = cityPlaceRowsEnabled\(\)/);
  assert.doesNotMatch(await read('app/page.tsx'), /CITY_PLACE_ROWS|cityPlaceRowsEnabled/);
});

test('pills and rows share cityPlaceIds: building order, labels, and the location catalog', () => {
  assert.deepEqual(cityLocationOrder(), [...cityPlaceIds]);
  const open = createCityWorld('kindle', 'Forgehaven', { marketOpen: true });
  assert.deepEqual(open.buildings.map(b => b.location), [...cityPlaceIds]);
  for (const building of open.buildings) assert.equal(building.label, cityPlaceLabel(building.location, 'Forgehaven', 'kindle'));
  const closed = createCityWorld('kindle', 'Forgehaven', { marketOpen: false });
  assert.deepEqual(closed.buildings.map(b => b.location), cityPlaceIds.filter(id => id !== 'market'));
  const korund = createCityWorld('korund', 'Stonehearth');
  assert.deepEqual(korund.buildings.map(b => b.label), cityPlaces('korund', 'Stonehearth', true).map(place => place.label));
  assert.equal(cityPlaceLabel('home', 'Forgehaven', 'kindle', true), 'Household');
});

let panelMod;
const render = async (places, icons = false, market = true, visitor = false, destinations) => {
  if (!panelMod) {
    const { build } = await import('esbuild');
    const out = await build({ entryPoints: [new URL('../app/scene-panels-v2.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
      packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') },
      define: { 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_PANEL': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CITY': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_CITY_PLACE_ROWS': '"false"' } });
    const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
    panelMod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  }
  const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
  const props = { cityName: 'Forgehaven', city: { capital: true }, nation, destinations: destinations ?? cityDestinations('kindle', market), onView: () => {}, places, icons, visitor };
  return renderToStaticMarkup(React.createElement(panelMod.CitySummary, props));
};
const labels = html => [...html.matchAll(/<strong>([^<]*)<\/strong>/g)].map(m => m[1]);

test('flag off keeps the destination rows and Household primary', async () => {
  const html = await render(false, true);
  assert.deepEqual(labels(html), ['Workplace', 'Market', 'Government']);
  assert.match(html, /class="panel-v2-primary"/);
  assert.match(html, />Household</);
  assert.doesNotMatch(html, /Forgehaven square/);
  assert.equal((html.match(/<span class="panel-v2-icon" aria-hidden="true"><svg/g) ?? []).length, 4);
});

test('flag on: five pill places, pill order, pill icons, keyboard buttons with a visible focus rule', async () => {
  const html = await render(true);
  const places = cityPlaces('kindle', 'Forgehaven', true);
  assert.deepEqual(labels(html), places.map(place => place.label));
  assert.equal(places.map(place => place.id).join(), cityPlaceIds.join());
  for (const place of places) assert.ok(html.includes(place.detail), place.id);
  const svgs = [...html.matchAll(/<span class="panel-v2-icon" aria-hidden="true">(<svg[\s\S]*?<\/svg>)<\/span>/g)].map(m => m[1]);
  assert.equal(svgs.length, 5);
  assert.equal(new Set(svgs).size, 5, 'each place keeps its own pill icon');
  const pill = await read('app/city-pill.tsx');
  assert.match(pill, /square: UsersThree, home: House, workplace: Hammer, market: Storefront, government: Bank/);
  assert.match(pill, /icons\[location as CityPlaceId\]/);
  assert.match(pill, /icons\[id === 'household' \? 'home' : id\]/);
  assert.match(html, /class="panel-v2-primary"/);
  assert.ok(html.indexOf('</ul>') < html.indexOf('panel-v2-primary'), 'rows first, then the Household primary');
  assert.match(html, />Household</);
  assert.doesNotMatch(html, /aria-label="Household:/, 'Your household and Household are already different names');
  assert.doesNotMatch(html, /Open household/i);
  const buttons = [...html.matchAll(/<li><button type="button"(?! disabled)[^>]*>([\s\S]*?)<\/button><\/li>/g)];
  assert.equal(buttons.length, 5);
  for (const [, inner] of buttons) {
    assert.match(inner, /<span class="panel-v2-icon" aria-hidden="true"><svg/);
    assert.match(inner, /<strong>[^<]+<\/strong>/);
    assert.doesNotMatch(inner, /tabindex="-1"/);
  }
  const css = await read('app/panel-v2.css');
  assert.match(css, /\.panel-v2-rows button:focus-visible,\.panel-v2-primary:focus-visible\{outline:2px solid #d6b45c/);
  const hidden = await render(true, false, false);
  assert.deepEqual(labels(hidden), cityPlaces('kindle', 'Forgehaven', false).map(place => place.label));
  assert.equal((hidden.match(/<li><button/g) ?? []).length, 4);
  const guest = await render(true, false, true, true);
  assert.equal(labels(guest)[1], 'Household');
});

test('flag on: the Household primary is present, and a matching row keeps the card detail in its name', async () => {
  const html = await render(true, true);
  assert.match(html, /<button type="button" class="panel-v2-primary"/);
  assert.ok(html.indexOf('</ul>') < html.indexOf('panel-v2-primary'), 'keyboard order is rows, then the CTA');
  assert.equal((html.match(/>Household</g) ?? []).length, 1);
  assert.ok(labels(html).includes('Your household'));
  assert.doesNotMatch(html.slice(html.indexOf('panel-v2-primary')), /tabindex="-1"/);
  const guest = await render(true, false, true, true);
  assert.match(guest, /aria-label="Household: Belongings and recovery"/);
  assert.match(guest, /<strong>Household<\/strong><small>Food, belongings and recovery\.<\/small>/);
  assert.match(guest, /class="panel-v2-primary"/);
  assert.ok(guest.indexOf('</ul>') < guest.indexOf('panel-v2-primary'));
  const noHome = cityDestinations('kindle', true).filter(card => card.id !== 'household');
  assert.doesNotMatch(await render(true, false, true, false, noHome), /panel-v2-primary/);
  assert.doesNotMatch(await render(false, false, true, false, noHome), /panel-v2-primary/);
  assert.doesNotMatch(await render(true, false, true, true, noHome), /panel-v2-primary/);
});
