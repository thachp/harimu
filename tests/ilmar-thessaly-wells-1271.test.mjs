/** #1271: Thessaly Wells is an Ilmar resident city behind HARIMU_ILMAR_THESSALY_WELLS_ENABLED.
 *  Flag off: residentCitiesForNation, cityForNation, enroll, home, travel and the city panel match today.
 *  Flag on: specialty "Farming / oasis", the existing heartland capture note, and cityHasImports false.
 *  citiesForNation('ilmar') stays capital plus two. No country-map pin. No imports. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { bindThessalyWellsEnv, citiesForNation, cityCaptureNote, cityForNation, cityHasImports, cityImportsNote, citySpecialtyFields, HEARTLAND_CAPTURE_NOTE, residentCitiesForNation, THESSALY_WELLS_FLAG } from '../lib/cities.ts';
import { FLAG_PACKS } from '../lib/flag-pack.mjs';
import { localRuntime } from './helpers/local-runtime.mjs';

const FLAG = THESSALY_WELLS_FLAG;
const SPECIALTY = 'Farming / oasis';
const DESCRIPTION = 'Date palms around shaded courtyards in the eastern oasis belt.';
const ilmarIds = ['mirrorhall', 'lume-mesa', 'glassen'];
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1'));
const clear = () => { bindThessalyWellsEnv(undefined); delete process.env[FLAG]; };
const openIlmar = r => {
  r.setFixtureEnv('HARIMU_ILMAR_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_QA_TEST_CITIZENS', 'true');
  r.setFixtureEnv('NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW', 'true');
  r.setFixtureEnv('HARIMU_QA_TEST_CITIZEN_IDS', 'well-off,well-on,vale');
};

test('flag off: no resident city; flag on: oasis resident, no imports, heartland; catalog unchanged either way', () => {
  clear();
  assert.deepEqual(citiesForNation('ilmar').map(c => c.id), ilmarIds);
  assert.deepEqual(residentCitiesForNation('ilmar').map(c => c.id), ilmarIds);
  assert.equal(cityForNation('ilmar', 'thessaly-wells'), undefined);
  assert.equal(cityCaptureNote('ilmar', 'thessaly-wells'), null);
  process.env[FLAG] = 'true';
  try {
    assert.deepEqual(citiesForNation('ilmar').map(c => c.id), ilmarIds, 'flag on leaves the capital-plus-two catalog');
    const city = cityForNation('ilmar', 'thessaly-wells');
    assert.equal(city?.name, 'Thessaly Wells');
    assert.equal(city.nationId, 'ilmar');
    assert.equal(city.role, SPECIALTY);
    assert.equal(city.capital, false);
    assert.equal(city.spa, undefined);
    assert.equal(city.description, DESCRIPTION);
    assert.equal(city.description.includes('Seven Wells'), false);
    assert.equal(cityHasImports(city), false);
    assert.equal(cityImportsNote(city), null);
    assert.equal(citySpecialtyFields('ilmar', 'thessaly-wells').specialtyRole, SPECIALTY);
    assert.equal(citySpecialtyFields('ilmar', 'thessaly-wells').specialtyNote, "Jobs here match this city's specialty.");
    assert.equal(cityCaptureNote('ilmar', 'thessaly-wells'), HEARTLAND_CAPTURE_NOTE);
    assert.deepEqual(residentCitiesForNation('ilmar').map(c => c.id), [...ilmarIds, 'thessaly-wells']);
    assert.equal(residentCitiesForNation('fulmara').some(c => c.id === 'thessaly-wells'), false);
  } finally { clear(); }
  bindThessalyWellsEnv({ HARIMU_GRAY_PACK: { [FLAG]: 'true' }, [FLAG]: 'false' });
  assert.equal(cityForNation('ilmar', 'thessaly-wells'), undefined, 'a direct string wins');
  clear();
});

test('the flag is at(-5) in HARIMU_GRAY_PACK, preview true and production false, and the map stays three pins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[FLAG], undefined);
  assert.equal(prod.vars[FLAG], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[FLAG], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[FLAG], 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-5), FLAG);
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-5), FLAG);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-4), 'HARIMU_VELDWOOD_MARROW_MILLS_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-5), FLAG);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-6), 'HARIMU_CONFLUENCE_RUEL_WORKS_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.length, 82); // GRAY 82: #1266 Vakk Harbor is 76, #1270 Ruel Works is 77, #1271 Thessaly Wells is 78, #1275 Marrow Mills is 79, #1279 Dao Works is 80; Dunkar Pass is 81; Better Auth is last
  const scene = readFileSync('app/country-scene.tsx', 'utf8');
  assert.match(scene, /citiesForNation\(nationId\)/);
  assert.match(scene, /\{x:50,y:32\},\{x:26,y:76\},\{x:76,y:76\}/);
  assert.doesNotMatch(scene, /thessaly|residentCitiesForNation/);
  assert.doesNotMatch(readFileSync('lib/assembly-rules.ts', 'utf8'), /thessaly/);
  assert.match(readFileSync('app/page.tsx', 'utf8'), /bindThessalyWellsEnv/);
  assert.match(readFileSync('tests/flag-off-audit-384.test.mjs', 'utf8'), new RegExp(FLAG));
});

test('flag off: enroll, travel, home and the panel omit Thessaly Wells; flag on: resident city, specialty, heartland, and no imports', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const offPanel = await r.call('city', 'alice');
  assert.equal(offPanel.data.currentCityId, 'forgehaven');
  assert.equal(JSON.stringify(offPanel.data).includes('thessaly'), false);
  assert.equal('importsNote' in offPanel.data, false);
  assert.equal((await r.call('citizen', 'alice')).data.flags.thessalyWells, undefined);
  openIlmar(r);
  r.setFixtureEnv('HARIMU_ENROLL_HOME_CITY_ENABLED', 'true');
  const vale = await r.call('citizen', 'vale', { action: 'enroll', nationId: 'ilmar', expectedNationId: null });
  assert.equal(vale.status, 200, JSON.stringify(vale.data));
  const capitalOff = await r.call('city', 'vale');
  assert.equal(capitalOff.data.currentCityId, 'mirrorhall');
  assert.equal(JSON.stringify(capitalOff.data).includes('thessaly'), false);
  const refused = await r.call('citizen', 'well-off', { action: 'enroll', nationId: 'ilmar', expectedNationId: null, cityId: 'thessaly-wells' });
  assert.equal(refused.status, 403);
  assert.equal(refused.data.reason, 'not_in_nation');
  assert.equal((await r.call('city', 'vale', { action: 'travel', cityId: 'thessaly-wells' })).status, 400);
  r.setFixtureEnv('HARIMU_HOME_CITY_MOVE_ENABLED', 'true');
  assert.equal((await r.call('city-home', 'vale', { cityId: 'thessaly-wells', requestId: randomUUID() })).data.reason, 'not_your_nation');

  r.setFixtureEnv(FLAG, 'true');
  assert.equal((await r.call('citizen', 'alice')).data.flags.thessalyWells, true);
  const enrolled = await r.call('citizen', 'well-on', { action: 'enroll', nationId: 'ilmar', expectedNationId: null, cityId: 'thessaly-wells' });
  assert.equal(enrolled.status, 200, JSON.stringify(enrolled.data));
  r.setFixtureEnv('HARIMU_CITY_IMPORTS_NOTE_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_CITY_SPECIALTY_NOTE_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_CITY_CAPTURE_NOTE_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_CITY_CIVIC_UNIT_NOTE_ENABLED', 'true');
  const home = await r.call('city', 'well-on');
  assert.equal(home.data.homeCityId, 'thessaly-wells');
  assert.equal(home.data.currentCityId, 'thessaly-wells');
  assert.equal('importsNote' in home.data, false);
  assert.equal(home.data.specialtyRole, SPECIALTY);
  assert.equal(home.data.specialtyNote, "Jobs here match this city's specialty.");
  assert.equal(home.data.captureNote, HEARTLAND_CAPTURE_NOTE);
  assert.equal(home.data.civicUnitNote, 'voting district');
  const capital = await r.call('city', 'vale');
  assert.equal(capital.data.currentCityId, 'mirrorhall');
  assert.equal(capital.data.specialtyRole, 'Capital');
  assert.equal(JSON.stringify(capital.data).includes('thessaly'), false);
  assert.equal('importsNote' in capital.data, false);
  const travel = await r.call('city', 'vale', { action: 'travel', cityId: 'thessaly-wells' });
  assert.equal(travel.status, 200, JSON.stringify(travel.data));
  assert.equal(travel.data.currentCityId, 'thessaly-wells');
  assert.equal(travel.data.specialtyRole, SPECIALTY);
  assert.equal(travel.data.captureNote, HEARTLAND_CAPTURE_NOTE);
  assert.equal('importsNote' in travel.data, false);
  const named = await r.call('city-home', 'vale', { cityId: 'thessaly-wells', requestId: randomUUID() });
  assert.equal(named.status, 403);
  assert.equal(named.data.reason, 'not_open_yet', 'the city is recognized; Ilmar has no home-move currency, so the existing not_open_yet refusal stands');
  assert.deepEqual(citiesForNation('ilmar').map(c => c.id), ilmarIds);
  r.setFixtureEnv(FLAG, 'false');
  assert.equal((await r.call('citizen', 'alice')).data.flags.thessalyWells, undefined);
  assert.equal(JSON.stringify((await r.call('city', 'alice')).data).includes('thessaly'), false);
  assert.equal((await r.call('city', 'vale', { action: 'travel', cityId: 'lume-mesa' })).data.currentCityId, 'lume-mesa');
  assert.equal(JSON.stringify((await r.call('city', 'vale')).data).includes('thessaly'), false);
});
