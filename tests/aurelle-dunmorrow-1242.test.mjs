/** #1242: Dunmorrow, Aurelle resident city behind HARIMU_AURELLE_DUNMORROW_ENABLED. Flag off matches today.
 *  "Hosts Hearth Night" shows only with HARIMU_AURELLE_HEARTH_NIGHT_ENABLED, using the #1146 next date. citiesForNation stays capital plus two. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { aurelleNextHearthNightAt } from '../lib/aurelle-hearth-night.ts';
import { bindDunmorrowEnv, citiesForNation, cityCaptureNote, cityForNation, citySpecialtyFields, DUNMORROW_FLAG, DUNMORROW_HEARTH_NOTE, HEARTLAND_CAPTURE_NOTE, residentCitiesForNation } from '../lib/cities.ts';
import { FLAG_PACKS } from '../lib/flag-pack.mjs';
import { localRuntime } from './helpers/local-runtime.mjs';

const FLAG = DUNMORROW_FLAG;
const HEARTH = 'HARIMU_AURELLE_HEARTH_NIGHT_ENABLED';
const aurelleIds = ['highspire', 'windrest', 'highmere'];
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1'));
const clear = () => bindDunmorrowEnv(undefined);

test('flag off: no resident city; flag on: religious center and heartland; catalog unchanged either way', () => {
  clear();
  assert.deepEqual(citiesForNation('aurelle').map(c => c.id), aurelleIds);
  assert.deepEqual(residentCitiesForNation('aurelle').map(c => c.id), aurelleIds);
  assert.equal(cityForNation('aurelle', 'dunmorrow'), undefined);
  bindDunmorrowEnv({ [FLAG]: 'true' });
  try {
    assert.deepEqual(citiesForNation('aurelle').map(c => c.id), aurelleIds, 'flag on leaves the capital-plus-two catalog');
    const city = cityForNation('aurelle', 'dunmorrow');
    assert.equal(city?.name, 'Dunmorrow');
    assert.equal(city.nationId, 'aurelle');
    assert.equal(city.role, 'Religious center');
    assert.equal(city.description, 'Kinward name-stone halls in white stone along the eastern gorge.');
    assert.equal(citySpecialtyFields('aurelle', 'dunmorrow').specialtyRole, 'Religious center');
    assert.equal(cityCaptureNote('aurelle', 'dunmorrow'), HEARTLAND_CAPTURE_NOTE);
    assert.deepEqual(residentCitiesForNation('aurelle').map(c => c.id), [...aurelleIds, 'dunmorrow']);
    assert.equal(residentCitiesForNation('kindle').some(c => c.id === 'dunmorrow'), false);
  } finally { clear(); }
  bindDunmorrowEnv({ HARIMU_GRAY_PACK: { [FLAG]: 'true' }, [FLAG]: 'false' });
  assert.equal(cityForNation('aurelle', 'dunmorrow'), undefined, 'a direct string wins');
  clear();
});

test('the flag is GRAY 73 in HARIMU_GRAY_PACK, preview true and production false, and the map stays three pins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[FLAG], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[FLAG], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[FLAG], 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-3), FLAG);
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-3), FLAG);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-3), FLAG);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.length, 75); // GRAY 75: Dunmorrow is 73rd; #1259 Corvel Isles is 74th; #1271 Thessaly Wells is last
  const scene = readFileSync('app/country-scene.tsx', 'utf8');
  assert.match(scene, /citiesForNation\(nationId\)/);
  assert.match(scene, /\{x:50,y:32\},\{x:26,y:76\},\{x:76,y:76\}/);
  assert.doesNotMatch(scene, /dunmorrow|residentCitiesForNation/);
});

test('flag off: enroll, travel, home and the panel omit Dunmorrow; flag on: resident city; the Hearth Night line needs both flags', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const offPanel = await r.call('city', 'alice');
  assert.equal(offPanel.data.currentCityId, 'forgehaven');
  assert.equal(JSON.stringify(offPanel.data).includes('dunmorrow') || JSON.stringify(offPanel.data).includes(DUNMORROW_HEARTH_NOTE), false);
  assert.equal('hearthNightNote' in offPanel.data || 'hearthNightNextAt' in offPanel.data, false);
  assert.equal((await r.call('citizen', 'alice')).data.flags.dunmorrow, undefined);
  r.setFixtureEnv('HARIMU_ENROLL_HOME_CITY_ENABLED', 'true');
  const vale = await r.call('citizen', 'vale', { action: 'enroll', nationId: 'aurelle', expectedNationId: null });
  assert.equal(vale.status, 200, JSON.stringify(vale.data));
  const refused = await r.call('citizen', 'mora-off', { action: 'enroll', nationId: 'aurelle', expectedNationId: null, cityId: 'dunmorrow' });
  assert.equal(refused.status, 403);
  assert.equal(refused.data.reason, 'not_in_nation');
  assert.equal((await r.call('city', 'vale', { action: 'travel', cityId: 'dunmorrow' })).status, 400);
  r.setFixtureEnv('HARIMU_HOME_CITY_MOVE_ENABLED', 'true');
  assert.equal((await r.call('city-home', 'vale', { cityId: 'dunmorrow', requestId: randomUUID() })).data.reason, 'not_your_nation');

  r.setFixtureEnv(FLAG, 'true');
  assert.equal((await r.call('citizen', 'alice')).data.flags.dunmorrow, true);
  const enrolled = await r.call('citizen', 'mora', { action: 'enroll', nationId: 'aurelle', expectedNationId: null, cityId: 'dunmorrow' });
  assert.equal(enrolled.status, 200, JSON.stringify(enrolled.data));
  r.setFixtureEnv('HARIMU_CITY_SPECIALTY_NOTE_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_CITY_CAPTURE_NOTE_ENABLED', 'true');
  const home = await r.call('city', 'mora');
  assert.equal(home.data.homeCityId, 'dunmorrow');
  assert.equal(home.data.currentCityId, 'dunmorrow');
  assert.equal(home.data.specialtyRole, 'Religious center');
  assert.equal(home.data.captureNote, HEARTLAND_CAPTURE_NOTE);
  assert.equal('hearthNightNote' in home.data, false, 'Hearth Night flag off: the line is absent');
  const travel = await r.call('city', 'vale', { action: 'travel', cityId: 'dunmorrow' });
  assert.equal(travel.status, 200, JSON.stringify(travel.data));
  assert.equal(travel.data.currentCityId, 'dunmorrow');
  assert.equal('hearthNightNote' in travel.data, false);
  const named = await r.call('city-home', 'vale', { cityId: 'dunmorrow', requestId: randomUUID() });
  assert.equal(named.status, 403);
  assert.equal(named.data.reason, 'not_open_yet', 'the city is recognized; Aurelle paid moves stay the existing not_open_yet refusal');
  assert.deepEqual(citiesForNation('aurelle').map(c => c.id), aurelleIds);

  r.setFixtureEnv(HEARTH, 'true');
  const hosted = await r.call('city', 'mora');
  const nextAt = aurelleNextHearthNightAt(Math.floor(r.now / 1000) * 1000);
  const government = (await r.call('citizen', 'mora')).data.government;
  assert.equal(hosted.data.hearthNightNote, DUNMORROW_HEARTH_NOTE);
  assert.equal(hosted.data.hearthNightNextAt, nextAt);
  assert.equal(hosted.data.hearthNightNextAt, government.hearthNight.nextAt, 'same next date as the government read');
  await r.db.prepare("UPDATE citizen_city_locations SET current_city_id='highspire' WHERE user_id='vale'").run();
  const capitalPanel = await r.call('city', 'vale');
  assert.equal(capitalPanel.data.currentCityId, 'highspire');
  assert.equal('hearthNightNote' in capitalPanel.data, false, 'only Dunmorrow hosts the line');
  r.setFixtureEnv(HEARTH, 'false');
  const hidden = await r.call('city', 'mora');
  assert.equal('hearthNightNote' in hidden.data, false);
  assert.equal('hearthNight' in (await r.call('citizen', 'mora')).data.government, false);
  r.setFixtureEnv(FLAG, 'false');
  assert.equal((await r.call('citizen', 'alice')).data.flags.dunmorrow, undefined);
  assert.equal(JSON.stringify((await r.call('city', 'alice')).data).includes('dunmorrow'), false);
});

test('CitySummary shows Hosts Hearth Night only when the API sends the line', async () => {
  const { build } = await import('esbuild');
  const out = await build({
    stdin: { contents: "export { CitySummary } from './app/scene-panels-v2.tsx';", resolveDir: new URL('..', import.meta.url).pathname, loader: 'tsx' },
    bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', packages: 'external',
    alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') },
    loader: { '.css': 'empty' }, logLevel: 'silent',
    plugins: [{ name: 'css-modules', setup(b) { b.onResolve({ filter: /\.module\.css$/ }, () => ({ path: 'm', namespace: 'cssm' })); b.onLoad({ filter: /.*/, namespace: 'cssm' }, () => ({ contents: 'export default new Proxy({}, { get: (_, k) => String(k) })' })); } }],
    define: { 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_PANEL': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CITY': '"false"' },
  });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
  const nation = { id: 'aurelle', name: 'Aurelle', capital: 'Highspire', currency: 'Crown', government: 'Monarchy', economy: 'e', religion: 'r' };
  const destinations = [{ id: 'household', label: 'Household', detail: 'Home' }, { id: 'workplace', label: 'Workplace', detail: 'Work' }];
  const nextAt = aurelleNextHearthNightAt(1_700_000_000_000);
  const base = renderToStaticMarkup(React.createElement(mod.CitySummary, { cityName: 'Dunmorrow', city: { capital: false }, nation, destinations, onView: () => {} }));
  assert.equal(base.includes(DUNMORROW_HEARTH_NOTE), false);
  const shown = renderToStaticMarkup(React.createElement(mod.CitySummary, {
    cityName: 'Dunmorrow', city: { capital: false }, nation, destinations, onView: () => {},
    hearthNightNote: DUNMORROW_HEARTH_NOTE, hearthNightNextAt: nextAt,
  }));
  assert.ok(shown.includes(DUNMORROW_HEARTH_NOTE) && shown.includes(new Date(nextAt).toISOString()));
});
