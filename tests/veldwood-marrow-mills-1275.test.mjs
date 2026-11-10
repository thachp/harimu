/** #1275: Marrow Mills, Veldwood resident city behind HARIMU_VELDWOOD_MARROW_MILLS_ENABLED.
 *  Flag off: residentCitiesForNation, cityForNation, enroll, home, travel and the city panel match today,
 *  including when Ring Moot and Dunmorrow are on. Not a country-map pin. citiesForNation('veldwood') stays capital plus two.
 *  No festival host, imports, or sea-lane effect.
 *  Provisional GRAY 76 (last on origin/dev 2dc1dc32). Expected to land around 79 after #1266, #1272 and #1273. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { bindMarrowMillsEnv, citiesForNation, cityCaptureNote, cityCivicUnitNote, cityForNation, cityHasImports, cityImportsNote, citySpecialtyFields, HEARTLAND_CAPTURE_NOTE, MARROW_MILLS_FLAG, residentCitiesForNation } from '../lib/cities.ts';
import { FLAG_PACKS } from '../lib/flag-pack.mjs';
import { seasonLengthMs, seasonOrder } from '../lib/game-season.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const FLAG = MARROW_MILLS_FLAG;
const RING_MOOT = 'HARIMU_VELDWOOD_RING_MOOT_ENABLED';
const DUNMORROW = 'HARIMU_AURELLE_DUNMORROW_ENABLED';
const siblingsOn = { HARIMU_GRAY_PACK: { [RING_MOOT]: 'true', [DUNMORROW]: 'true' } };
const ids = ['ringhall', 'ashglade', 'fernhollow'];
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1'));
const clear = () => bindMarrowMillsEnv(undefined);
const openVeldwood = r => {
  r.setFixtureEnv('HARIMU_QA_TEST_CITIZENS', 'true');
  r.setFixtureEnv('NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW', 'true');
  r.setFixtureEnv('HARIMU_QA_TEST_CITIZEN_IDS', 'grove,refused,mills');
  r.setFixtureEnv('HARIMU_VELDWOOD_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_ENROLL_HOME_CITY_ENABLED', 'true');
};

test('flag off: no resident city; flag on: Industry / boats, heartland, no imports; catalog unchanged either way', () => {
  clear();
  assert.deepEqual(citiesForNation('veldwood').map(c => c.id), ids);
  assert.deepEqual(residentCitiesForNation('veldwood').map(c => c.id), ids);
  assert.equal(cityForNation('veldwood', 'marrow-mills'), undefined);
  bindMarrowMillsEnv({ [FLAG]: 'true' });
  try {
    assert.deepEqual(citiesForNation('veldwood').map(c => c.id), ids, 'flag on leaves the capital-plus-two catalog');
    const city = cityForNation('veldwood', 'marrow-mills');
    assert.equal(city?.name, 'Marrow Mills');
    assert.equal(city.nationId, 'veldwood');
    assert.equal(city.role, 'Industry / boats');
    assert.equal(city.capital, false);
    assert.equal(city.spa, undefined);
    assert.equal(city.description, 'Heartwood boat halls on the river in the eastern river valley.');
    assert.equal(citySpecialtyFields('veldwood', 'marrow-mills').specialtyRole, 'Industry / boats');
    assert.equal(cityCaptureNote('veldwood', 'marrow-mills'), HEARTLAND_CAPTURE_NOTE);
    assert.equal(cityCivicUnitNote('veldwood'), 'Grove');
    assert.equal(cityHasImports(city), false);
    assert.equal(cityImportsNote(city), null);
    assert.deepEqual(residentCitiesForNation('veldwood').map(c => c.id), [...ids, 'marrow-mills']);
    assert.equal(residentCitiesForNation('kindle').some(c => c.id === 'marrow-mills'), false);
  } finally { clear(); }
  bindMarrowMillsEnv({ HARIMU_GRAY_PACK: { [FLAG]: 'true' }, [FLAG]: 'false' });
  assert.equal(cityForNation('veldwood', 'marrow-mills'), undefined, 'a direct string wins');
  clear();
});

test('the flag is last in HARIMU_GRAY_PACK, preview true and production false, and the map stays three pins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[FLAG], undefined);
  assert.equal(prod.vars[FLAG], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[FLAG], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[FLAG], 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-1), FLAG);
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-1), FLAG);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-1), FLAG);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-2), 'HARIMU_ILMAR_LONG_LIGHT_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.length, 76); // provisional GRAY 76 on origin/dev 2dc1dc32; expected ~79 after #1266, #1272, #1273
  const scene = readFileSync('app/country-scene.tsx', 'utf8');
  assert.match(scene, /citiesForNation\(nationId\)/);
  assert.match(scene, /\{x:50,y:32\},\{x:26,y:76\},\{x:76,y:76\}/);
  assert.doesNotMatch(scene, /marrow-mills|residentCitiesForNation/);
  assert.match(readFileSync('app/page.tsx', 'utf8'), /bindMarrowMillsEnv/);
  assert.match(readFileSync('tests/flag-off-audit-384.test.mjs', 'utf8'), new RegExp(FLAG));
});

test('flag off: enroll, travel, home and the panel omit Marrow Mills; flag on: resident city, no imports and no sea lanes', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const offPanel = await r.call('city', 'alice');
  assert.equal(offPanel.data.currentCityId, 'forgehaven');
  assert.equal(JSON.stringify(offPanel.data).includes('marrow-mills'), false);
  assert.equal((await r.call('citizen', 'alice')).data.flags.marrowMills, undefined);
  openVeldwood(r);
  const grove = await r.call('citizen', 'grove', { action: 'enroll', nationId: 'veldwood', expectedNationId: null });
  assert.equal(grove.status, 200, JSON.stringify(grove.data));
  const refused = await r.call('citizen', 'refused', { action: 'enroll', nationId: 'veldwood', expectedNationId: null, cityId: 'marrow-mills' });
  assert.equal(refused.status, 403);
  assert.equal(refused.data.reason, 'not_in_nation');
  assert.equal((await r.call('city', 'grove', { action: 'travel', cityId: 'marrow-mills' })).status, 400);
  r.setFixtureEnv('HARIMU_HOME_CITY_MOVE_ENABLED', 'true');
  assert.equal((await r.call('city-home', 'grove', { cityId: 'marrow-mills', requestId: randomUUID() })).data.reason, 'not_your_nation');
  const capital = await r.call('city', 'grove');
  assert.equal(capital.data.currentCityId, 'ringhall');
  assert.equal(JSON.stringify(capital.data).includes('marrow-mills'), false);

  r.setFixtureEnv(FLAG, 'true');
  assert.equal((await r.call('citizen', 'alice')).data.flags.marrowMills, true);
  const enrolled = await r.call('citizen', 'mills', { action: 'enroll', nationId: 'veldwood', expectedNationId: null, cityId: 'marrow-mills' });
  assert.equal(enrolled.status, 200, JSON.stringify(enrolled.data));
  r.setFixtureEnv('HARIMU_CITY_SPECIALTY_NOTE_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_CITY_CAPTURE_NOTE_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_CITY_CIVIC_UNIT_NOTE_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_CITY_IMPORTS_NOTE_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_SEASON_SEA_LANES_ENABLED', 'true');
  const epochSec = Math.floor((r.now - (seasonOrder.indexOf('winter') * seasonLengthMs + 3_600_000)) / 1000);
  await r.db.prepare("INSERT INTO world_clock (id,epoch_seconds) VALUES ('main',?) ON CONFLICT(id) DO UPDATE SET epoch_seconds=excluded.epoch_seconds").bind(epochSec).run();
  const home = await r.call('city', 'mills');
  assert.equal(home.data.homeCityId, 'marrow-mills');
  assert.equal(home.data.currentCityId, 'marrow-mills');
  assert.equal(home.data.specialtyRole, 'Industry / boats');
  assert.equal(home.data.captureNote, HEARTLAND_CAPTURE_NOTE);
  assert.equal(home.data.civicUnitNote, 'Grove');
  assert.equal('importsNote' in home.data, false);
  assert.equal('seaLanesNote' in home.data, false);
  assert.equal(JSON.stringify(home.data).includes('Hosts '), false);
  assert.deepEqual(home.data.presence.map(p => p.cityId), ids, 'the presence list stays the catalog');
  const travel = await r.call('city', 'grove', { action: 'travel', cityId: 'marrow-mills' });
  assert.equal(travel.status, 200, JSON.stringify(travel.data));
  assert.equal(travel.data.currentCityId, 'marrow-mills');
  assert.equal('importsNote' in travel.data, false);
  assert.equal('seaLanesNote' in travel.data, false);
  const named = await r.call('city-home', 'grove', { cityId: 'marrow-mills', requestId: randomUUID() });
  assert.equal(named.status, 403);
  assert.equal(named.data.reason, 'not_open_yet', 'the city is recognized; Veldwood has no home-move wallet currency');
  assert.deepEqual(citiesForNation('veldwood').map(c => c.id), ids);
  r.setFixtureEnv(FLAG, 'false');
  assert.equal((await r.call('citizen', 'alice')).data.flags.marrowMills, undefined);
  const hidden = await r.call('city', 'mills');
  assert.equal(hidden.data.currentCityId, 'ringhall');
  assert.equal(JSON.stringify(hidden.data).includes('marrow-mills'), false);
});

test('flag off: Ring Moot and Dunmorrow on still omit Marrow Mills from lists, enroll, home, travel and flags', async t => {
  clear();
  bindMarrowMillsEnv(siblingsOn);
  try {
    assert.deepEqual(citiesForNation('veldwood').map(c => c.id), ids, 'catalog is unchanged');
    assert.deepEqual(residentCitiesForNation('veldwood').map(c => c.id), ids, 'Ring Moot and Dunmorrow on, Marrow Mills off: no marrow-mills');
    assert.equal(cityForNation('veldwood', 'marrow-mills'), undefined);
  } finally { clear(); }

  const r = await localRuntime(); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ [RING_MOOT]: 'true', [DUNMORROW]: 'true' }));
  assert.equal((await r.call('citizen', 'alice')).data.flags.marrowMills, undefined, 'Ring Moot and Dunmorrow on, Marrow Mills off: no flags.marrowMills');
  assert.equal(JSON.stringify((await r.call('city', 'alice')).data).includes('marrow-mills'), false);
  openVeldwood(r);
  const grove = await r.call('citizen', 'grove', { action: 'enroll', nationId: 'veldwood', expectedNationId: null });
  assert.equal(grove.status, 200, JSON.stringify(grove.data));
  const refused = await r.call('citizen', 'refused', { action: 'enroll', nationId: 'veldwood', expectedNationId: null, cityId: 'marrow-mills' });
  assert.equal(refused.status, 403);
  assert.equal(refused.data.reason, 'not_in_nation');
  assert.equal((await r.call('city', 'grove', { action: 'travel', cityId: 'marrow-mills' })).status, 400);
  r.setFixtureEnv('HARIMU_HOME_CITY_MOVE_ENABLED', 'true');
  assert.equal((await r.call('city-home', 'grove', { cityId: 'marrow-mills', requestId: randomUUID() })).data.reason, 'not_your_nation');
  const capital = await r.call('city', 'grove');
  assert.equal(capital.data.currentCityId, 'ringhall');
  assert.equal(JSON.stringify(capital.data).includes('marrow-mills'), false);
  assert.equal((await r.call('citizen', 'grove')).data.flags.marrowMills, undefined);
  assert.deepEqual(citiesForNation('veldwood').map(c => c.id), ids);
});
