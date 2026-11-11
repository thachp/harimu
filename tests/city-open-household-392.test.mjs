/** #392 UI 47: City Open household CTA. NEXT_PUBLIC_HARIMU_CITY_OPEN_HOUSEHOLD is HARIMU_UI_PACK entry 44.
 *  Preview on, production off. Flag on and a household card labeled exactly "Household": the primary reads
 *  "Open household", keeps the house icon, the gold primary, the trailing caret, and the same destination.
 *  The accessible name keeps the card detail when today's name includes it. Any other label, no card, or
 *  the flag off is today's markup. Other panels are unchanged. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { capitalCityForNation, cityForNation } from '../lib/cities.ts';
import { cityDestinations } from '../lib/city-destinations.ts';
import { cityOpenHouseholdEnabled, cityOpenHouseholdLabel, CITY_OPEN_HOUSEHOLD_FLAG, CITY_OPEN_HOUSEHOLD_LABEL } from '../lib/city-open-household.ts';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const key = CITY_OPEN_HOUSEHOLD_FLAG;
const aurelle = { id: 'aurelle', name: 'Aurelle', shortName: 'Aurelle', government: 'Absolute hereditary monarchy', capital: 'Highspire', currency: 'Crown (CRN) · gold-backed', economy: 'Royal charters and fiefs', religion: 'Kinward Rite state church', population: '924k' };
const highspire = capitalCityForNation('aurelle');
const windrest = cityForNation('aurelle', 'windrest');
const cards = cityDestinations('aurelle', true);
const retitle = label => cards.map(card => card.id === 'household' ? { ...card, label } : card);

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK entry 44, preview on and production off', async () => {
  const previous = process.env[key];
  try {
    delete process.env[key];
    assert.equal(cityOpenHouseholdEnabled(), false);
    assert.equal(cityOpenHouseholdEnabled('true'), true);
    for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(cityOpenHouseholdEnabled(value), false);
    process.env[key] = 'true';
    assert.equal(cityOpenHouseholdEnabled(), true);
  } finally {
    if (previous === undefined) delete process.env[key]; else process.env[key] = previous;
  }
  assert.equal(cityOpenHouseholdLabel('Household', true), CITY_OPEN_HOUSEHOLD_LABEL);
  assert.equal(cityOpenHouseholdLabel('Household', false), 'Household');
  for (const label of ['Your household', 'Visitor household', 'Household ']) assert.equal(cityOpenHouseholdLabel(label, true), label);
  const preview = strip(await read('wrangler.jsonc')), prod = strip(await read('wrangler.prod.jsonc'));
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(expandFlagPacks(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv(preview.vars)[key], 'true'); assert.equal(varsForProcessEnv(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv({ HARIMU_UI_PACK: preview.vars.HARIMU_UI_PACK, [key]: 'false' })[key], 'false', 'a direct string wins');
  assert.ok(FLAG_PACKS.HARIMU_UI_PACK.includes(key));
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 56);
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(43), key, 'entry 44');
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 56/);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /#392 city open household/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key));
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/city-open-household.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_CITY_OPEN_HOUSEHOLD/);
  assert.match(await read('app/scene-panels-v2.tsx'), /openHousehold = cityOpenHouseholdEnabled\(\)/);
  assert.doesNotMatch(await read('app/page.tsx'), /CITY_OPEN_HOUSEHOLD|cityOpenHouseholdEnabled/);
  assert.doesNotMatch(await read('app/panel-v2.tsx'), /CITY_OPEN_HOUSEHOLD|Open household/);
});

const bundle = async open => {
  const { build } = await import('esbuild');
  const define = { 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_PANEL': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CITY': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_CITY_PLACE_ROWS': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_CITY_HEADER_STATS': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_CITY_IDENTITY': '"true"' };
  if (open !== undefined) define['process.env.NEXT_PUBLIC_HARIMU_CITY_OPEN_HOUSEHOLD'] = JSON.stringify(open);
  const out = await build({ entryPoints: [new URL('../app/scene-panels-v2.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') }, define });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
};
const button = html => { const start = html.indexOf('<button type="button" class="panel-v2-primary"'); assert.ok(start >= 0, html.slice(0, 80)); return html.slice(start, html.indexOf('</button>', start) + 9); };
const asToday = html => html.replaceAll('Open household', 'Household');

test('flag on reads Open household with the caret and the same destination; other labels, no card, and flag off stay today', async () => {
  const previous = process.env[key];
  delete process.env[key];
  try {
    const onMod = await bundle('true'), offMod = await bundle('false'), missingMod = await bundle(undefined);
    const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
    const view = (mod, destinations = cards, extra = {}) => renderToStaticMarkup(React.createElement(mod.CitySummary, {
      cityName: extra.cityName ?? 'Highspire', city: extra.city ?? highspire, nation: aurelle, destinations, onView: extra.onView ?? (() => {}),
      visitor: extra.visitor, places: extra.places, icons: extra.icons, identity: extra.identity,
    }));
    const on = view(onMod), off = view(offMod), missing = view(missingMod);
    const town = view(onMod, cards, { cityName: 'Windrest', city: windrest });
    const quietPlaces = view(onMod, cards, { places: false });
    const quietOff = view(offMod, cards, { places: false });
    const guest = view(onMod, cards, { visitor: true });
    const guestOff = view(offMod, cards, { visitor: true });
    const other = view(onMod, retitle('Visitor household'), { visitor: true });
    const otherOff = view(offMod, retitle('Visitor household'), { visitor: true });
    const yours = view(onMod, retitle('Your household'));
    const noHome = cards.filter(card => card.id !== 'household');
    const gone = view(onMod, noHome), goneOff = view(offMod, noHome);
    assert.equal(asToday(on), off, 'flag on changes only the Household words');
    assert.equal(missing, off, 'a missing flag matches flag off');
    assert.match(button(on), /class="panel-v2-primary"/);
    assert.match(button(on), /<span>Open household<\/span>/);
    assert.match(button(on).replace(/<span class="panel-v2-icon"[\s\S]*?<\/span>/, ''), /<svg[^>]*aria-hidden="true"/, 'trailing caret, same as the rows');
    assert.equal(button(on).match(/<span class="panel-v2-icon" aria-hidden="true">([\s\S]*?)<\/span>/)[1], button(off).match(/<span class="panel-v2-icon" aria-hidden="true">([\s\S]*?)<\/span>/)[1], 'same house icon');
    assert.doesNotMatch(button(on), /aria-label=/, 'Your household and Household already differ, so the name is the visible label');
    assert.match(on, /class="panel-v2-city-kicker">City life<\/p>/);
    assert.match(on, /Capital of Aurelle/);
    assert.match(on, new RegExp(`class="panel-v2-city-tagline">${highspire.description}</p>`));
    assert.doesNotMatch(on, /Choose a place|Concept preview/);
    assert.match(button(quietPlaces), /<span>Open household<\/span>/);
    assert.doesNotMatch(button(quietPlaces), /aria-label=/);
    assert.equal(asToday(quietPlaces), quietOff);
    assert.match(guest, /aria-label="Open household: Belongings and recovery"/);
    assert.match(button(guest), /<span>Open household<\/span>/);
    assert.equal(asToday(guest), guestOff);
    assert.equal(other, otherOff, 'a visitor card whose label is not Household is unchanged');
    assert.match(other, />Visitor household</);
    assert.doesNotMatch(other, /Open household/);
    assert.equal(yours, view(offMod, retitle('Your household')));
    assert.match(yours, />Your household</);
    assert.equal(gone, goneOff);
    assert.doesNotMatch(gone, /panel-v2-primary|City life/);
    assert.match(town, /<h2>Windrest<\/h2><p>Aurelle<\/p>/);
    assert.match(button(town), /<span>Open household<\/span>/);
    assert.doesNotMatch(town, /Capital of/);
    assert.equal(asToday(town), view(offMod, cards, { cityName: 'Windrest', city: windrest }));
    const panels = mod => ({
      world: renderToStaticMarkup(React.createElement(mod.WorldSummary, { nation: aurelle, population: '924k', onView() {} })),
      market: renderToStaticMarkup(React.createElement(mod.MarketSummary, { nation: aurelle, walletMinor: 100, food: 2, board: true, listings: false, onHousehold() {} })),
      work: renderToStaticMarkup(React.createElement(mod.WorkSummary, { capacity: 18, contributions: 3, onMarket() {} })),
      government: renderToStaticMarkup(React.createElement(mod.GovernmentSummary, { nation: aurelle, account: false })),
    });
    const onPanels = panels(onMod), offPanels = panels(offMod);
    assert.equal(onPanels.world, offPanels.world);
    assert.equal(onPanels.market, offPanels.market);
    assert.match(onPanels.market, />Return to household</);
    assert.doesNotMatch(onPanels.market, /Open household/);
    assert.equal(onPanels.work, offPanels.work);
    assert.equal(onPanels.government, offPanels.government);
    assert.match(off, />Household</);
    assert.doesNotMatch(off, /Open household/);
    const { Window } = await import('happy-dom');
    const w = new Window({ url: 'http://localhost/' });
    const previousWindow = globalThis.window, previousDocument = globalThis.document;
    globalThis.window = w; globalThis.document = w.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    try {
      const { createRoot } = await import('react-dom/client'), { act } = await import('react');
      const views = [];
      const host = w.document.createElement('div'); w.document.body.append(host); const root = createRoot(host);
      await act(async () => { root.render(React.createElement(onMod.CitySummary, { cityName: 'Highspire', city: highspire, nation: aurelle, destinations: cards, onView: viewId => views.push(viewId) })); });
      host.querySelector('.panel-v2-primary').click();
      assert.deepEqual(views, ['household']);
      await act(async () => root.unmount());
    } finally {
      globalThis.window = previousWindow; globalThis.document = previousDocument;
      w.close();
    }
  } finally {
    if (previous === undefined) delete process.env[key]; else process.env[key] = previous;
  }
});
