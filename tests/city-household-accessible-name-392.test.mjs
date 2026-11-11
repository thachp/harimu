/** #392 UI 49: consistent accessible name for the City household primary.
 *  NEXT_PUBLIC_HARIMU_CITY_HOUSEHOLD_ACCESSIBLE_NAME is HARIMU_UI_PACK entry 46.
 *  Preview on, production off. Flag on: the household primary's accessible name is "{visible label}: {detail}"
 *  for a citizen (place row "Your household") and a visitor alike. A blank detail sets no aria-label.
 *  Flag off keeps today's name. Nothing visible changes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { capitalCityForNation } from '../lib/cities.ts';
import { cityDestinations } from '../lib/city-destinations.ts';
import { cityHouseholdAccessibleNameEnabled, cityHouseholdAriaLabel, CITY_HOUSEHOLD_ACCESSIBLE_NAME_FLAG } from '../lib/city-household-accessible-name.ts';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const key = CITY_HOUSEHOLD_ACCESSIBLE_NAME_FLAG;
const aurelle = { id: 'aurelle', name: 'Aurelle', shortName: 'Aurelle', government: 'Absolute hereditary monarchy', capital: 'Highspire', currency: 'Crown (CRN) · gold-backed', economy: 'Royal charters and fiefs', religion: 'Kinward Rite state church', population: '924k' };
const highspire = capitalCityForNation('aurelle');
const cards = cityDestinations('aurelle', true);
const detail = cards.find(card => card.id === 'household').detail;

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK entry 46, preview on and production off', async () => {
  const previous = process.env[key];
  try {
    delete process.env[key];
    assert.equal(cityHouseholdAccessibleNameEnabled(), false);
    assert.equal(cityHouseholdAccessibleNameEnabled('true'), true);
    for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(cityHouseholdAccessibleNameEnabled(value), false);
    process.env[key] = 'true';
    assert.equal(cityHouseholdAccessibleNameEnabled(), true);
  } finally {
    if (previous === undefined) delete process.env[key]; else process.env[key] = previous;
  }
  const named = 'Open household: Belongings and recovery';
  assert.equal(cityHouseholdAriaLabel('Open household', detail, true, undefined), named);
  assert.equal(cityHouseholdAriaLabel('Open household', `  ${detail}  `, true, 'legacy'), named);
  assert.equal(cityHouseholdAriaLabel('Open household', '', true, 'legacy'), undefined);
  assert.equal(cityHouseholdAriaLabel('Open household', '   ', true, 'Open household:    '), undefined);
  assert.equal(cityHouseholdAriaLabel('Open household', detail, false, undefined), undefined);
  assert.equal(cityHouseholdAriaLabel('Open household', '   ', false, 'Open household:    '), 'Open household:    ');
  assert.equal(cityHouseholdAriaLabel('Household', detail, false, `Household: ${detail}`), `Household: ${detail}`);
  const preview = strip(await read('wrangler.jsonc')), prod = strip(await read('wrangler.prod.jsonc'));
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(expandFlagPacks(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv(preview.vars)[key], 'true'); assert.equal(varsForProcessEnv(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv({ HARIMU_UI_PACK: preview.vars.HARIMU_UI_PACK, [key]: 'false' })[key], 'false', 'a direct string wins');
  assert.ok(FLAG_PACKS.HARIMU_UI_PACK.includes(key));
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 56);
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(45), key, 'entry 46');
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 56/);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /#392 city household accessible name/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key));
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/city-household-accessible-name.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_CITY_HOUSEHOLD_ACCESSIBLE_NAME/);
  assert.match(await read('app/scene-panels-v2.tsx'), /householdName = cityHouseholdAccessibleNameEnabled\(\)/);
  assert.doesNotMatch(await read('app/page.tsx'), /CITY_HOUSEHOLD_ACCESSIBLE_NAME|cityHouseholdAccessibleNameEnabled/);
  assert.doesNotMatch(await read('app/panel-v2.tsx'), /CITY_HOUSEHOLD_ACCESSIBLE_NAME/);
});

const bundle = async (name, open = 'true') => {
  const { build } = await import('esbuild');
  const define = { 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_PANEL': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CITY': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_CITY_PLACE_ROWS': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_CITY_HEADER_STATS': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_CITY_IDENTITY': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_CITY_OPEN_HOUSEHOLD': JSON.stringify(open) };
  if (name !== undefined) define['process.env.NEXT_PUBLIC_HARIMU_CITY_HOUSEHOLD_ACCESSIBLE_NAME'] = JSON.stringify(name);
  const out = await build({ entryPoints: [new URL('../app/scene-panels-v2.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') }, define });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
};
const button = html => { const start = html.indexOf('<button type="button" class="panel-v2-primary"'); assert.ok(start >= 0); return html.slice(start, html.indexOf('</button>', start)); };
const withoutPrimaryAria = html => { const start = html.indexOf('<button type="button" class="panel-v2-primary"'); const end = html.indexOf('>', start); return html.slice(0, start) + html.slice(start, end).replace(/ aria-label="[^"]*"/, '') + html.slice(end); };

test('citizen and visitor share the accessible name when the flag is on; a blank detail and flag off keep today', async () => {
  const previous = process.env[key];
  delete process.env[key];
  try {
    const onMod = await bundle('true'), offMod = await bundle('false'), missingMod = await bundle(undefined);
    const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
    const { Window } = await import('happy-dom');
    const view = (mod, extra = {}) => renderToStaticMarkup(React.createElement(mod.CitySummary, {
      cityName: 'Highspire', city: highspire, nation: aurelle, destinations: extra.destinations ?? cards, onView: () => {}, visitor: extra.visitor,
    }));
    const citizenOn = view(onMod), citizenOff = view(offMod), citizenMissing = view(missingMod);
    const visitorOn = view(onMod, { visitor: true }), visitorOff = view(offMod, { visitor: true });
    const blankCards = cards.map(card => card.id === 'household' ? { ...card, detail: '   ' } : card);
    const blankOn = view(onMod, { visitor: true, destinations: blankCards });
    const blankOff = view(offMod, { visitor: true, destinations: blankCards });
    const window = new Window({ url: 'http://localhost/' });
    const accessibleName = html => {
      window.document.body.innerHTML = html;
      const primary = window.document.querySelector('.panel-v2-primary');
      const labelled = primary.getAttribute('aria-label');
      const visible = [...primary.querySelectorAll('span')].filter(span => span.getAttribute('aria-hidden') !== 'true').map(span => span.textContent).join('');
      const name = labelled && labelled.trim() ? labelled : visible;
      assert.ok(name.startsWith(visible), `${name} does not start with the visible label ${visible}`);
      return name;
    };
    const names = { citizenOn: accessibleName(citizenOn), visitorOn: accessibleName(visitorOn), citizenOff: accessibleName(citizenOff), visitorOff: accessibleName(visitorOff) };
    console.log(`ACCESSIBLE_NAMES ${JSON.stringify(names)}`);
    const full = `Open household: ${detail}`;
    assert.equal(names.citizenOn, full);
    assert.equal(names.visitorOn, full);
    assert.equal(names.citizenOff, 'Open household');
    assert.equal(names.visitorOff, full);
    assert.match(citizenOn, /<strong>Your household<\/strong>/);
    assert.match(visitorOn, /<strong>Household<\/strong>/);
    assert.match(button(citizenOn), /<span>Open household<\/span>/);
    assert.match(button(visitorOn), /<span>Open household<\/span>/);
    assert.doesNotMatch(button(citizenOff), /aria-label=/);
    assert.match(button(visitorOff), new RegExp(`aria-label="${full}"`));
    assert.equal(withoutPrimaryAria(citizenOn), citizenOff, 'flag on changes only the citizen aria-label');
    assert.equal(visitorOn, visitorOff, 'a visitor name is unchanged');
    assert.equal(citizenMissing, citizenOff, 'a missing flag matches flag off');
    const legacyBlank = `Open household: ${'   '}`;
    assert.equal(accessibleName(blankOn), 'Open household');
    assert.doesNotMatch(button(blankOn), /aria-label=/);
    assert.equal(button(blankOff).includes(`aria-label="${legacyBlank}"`), true);
    window.close();
  } finally {
    if (previous === undefined) delete process.env[key]; else process.env[key] = previous;
  }
});
