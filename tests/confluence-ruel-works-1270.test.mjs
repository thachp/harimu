/** #1270: Ruel Works, Confluence resident city behind HARIMU_CONFLUENCE_RUEL_WORKS_ENABLED.
 *  Flag off: residentCitiesForNation, cityForNation, enroll, home, travel and the city panel match today.
 *  Not a country-map pin. citiesForNation('confluence') stays capital plus two. No festival host, imports, or sea-lane effect. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { bindDunmorrowEnv, bindRuelWorksEnv, citiesForNation, cityCaptureNote, cityCivicUnitNote, cityForNation, cityHasImports, cityImportsNote, citySpecialtyFields, DUNMORROW_FLAG, HEARTLAND_CAPTURE_NOTE, residentCitiesForNation, RUEL_WORKS_FLAG } from '../lib/cities.ts';
import { FLAG_PACKS } from '../lib/flag-pack.mjs';
import { seasonLengthMs, seasonOrder } from '../lib/game-season.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const FLAG = RUEL_WORKS_FLAG;
const ids = ['meetwater', 'lanu-terraces', 'oalin-harbor'];
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1'));
const clear = () => bindRuelWorksEnv(undefined);
const openConfluence = r => {
  r.setFixtureEnv('HARIMU_QA_TEST_CITIZENS', 'true');
  r.setFixtureEnv('NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW', 'true');
  r.setFixtureEnv('HARIMU_QA_TEST_CITIZEN_IDS', 'lane,refused,works');
  r.setFixtureEnv('HARIMU_CONFLUENCE_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_ENROLL_HOME_CITY_ENABLED', 'true');
};

test('flag off: no resident city; flag on: Industry, heartland, no imports; catalog unchanged either way', () => {
  clear();
  assert.deepEqual(citiesForNation('confluence').map(c => c.id), ids);
  assert.deepEqual(residentCitiesForNation('confluence').map(c => c.id), ids);
  assert.equal(cityForNation('confluence', 'ruel-works'), undefined);
  bindRuelWorksEnv({ [FLAG]: 'true' });
  try {
    assert.deepEqual(citiesForNation('confluence').map(c => c.id), ids, 'flag on leaves the capital-plus-two catalog');
    const city = cityForNation('confluence', 'ruel-works');
    assert.equal(city?.name, 'Ruel Works');
    assert.equal(city.nationId, 'confluence');
    assert.equal(city.role, 'Industry');
    assert.equal(city.capital, false);
    assert.equal(city.spa, undefined);
    assert.equal(city.description, 'Timber-and-tile workshops along mill canals on the eastern river fork.');
    assert.equal(citySpecialtyFields('confluence', 'ruel-works').specialtyRole, 'Industry');
    assert.equal(cityCaptureNote('confluence', 'ruel-works'), HEARTLAND_CAPTURE_NOTE);
    assert.equal(cityCivicUnitNote('confluence'), 'voting district');
    assert.equal(cityHasImports(city), false);
    assert.equal(cityImportsNote(city), null);
    assert.deepEqual(residentCitiesForNation('confluence').map(c => c.id), [...ids, 'ruel-works']);
    assert.equal(residentCitiesForNation('kindle').some(c => c.id === 'ruel-works'), false);
  } finally { clear(); }
  bindRuelWorksEnv({ HARIMU_GRAY_PACK: { [FLAG]: 'true' }, [FLAG]: 'false' });
  assert.equal(cityForNation('confluence', 'ruel-works'), undefined, 'a direct string wins');
  clear();
});

test('Dunmorrow on does not open Ruel Works', () => {
  clear();
  bindDunmorrowEnv(undefined);
  const sibling = { [FLAG]: 'false', [DUNMORROW_FLAG]: 'true' };
  bindRuelWorksEnv(sibling);
  bindDunmorrowEnv(sibling);
  try {
    assert.equal(cityForNation('aurelle', 'dunmorrow')?.id, 'dunmorrow', 'the sibling flag is on');
    assert.equal(cityForNation('confluence', 'ruel-works'), undefined);
    assert.deepEqual(residentCitiesForNation('confluence').map(c => c.id), ids);
    assert.equal(residentCitiesForNation('confluence').some(c => c.id === 'ruel-works'), false);
    assert.deepEqual(citiesForNation('confluence').map(c => c.id), ids);
  } finally {
    clear();
    bindDunmorrowEnv(undefined);
  }
});

test('the flag is at(-4) in HARIMU_GRAY_PACK, preview true and production false, and the map stays three pins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[FLAG], undefined);
  assert.equal(prod.vars[FLAG], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[FLAG], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[FLAG], 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-4), FLAG);
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-4), FLAG);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-2), 'HARIMU_VELDWOOD_MARROW_MILLS_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-3), 'HARIMU_ILMAR_THESSALY_WELLS_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-4), FLAG);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-5), 'HARIMU_HOARVALE_VAKK_HARBOR_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-6), 'HARIMU_ILMAR_LONG_LIGHT_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.length, 80); // GRAY 80. #1266 Vakk Harbor is 76. #1270 Ruel Works is 77. #1271 Thessaly Wells is 78. #1275 Marrow Mills is 79, #1279 Dao Works is last
  const scene = readFileSync('app/country-scene.tsx', 'utf8');
  assert.match(scene, /citiesForNation\(nationId\)/);
  assert.match(scene, /\{x:50,y:32\},\{x:26,y:76\},\{x:76,y:76\}/);
  assert.doesNotMatch(scene, /ruel-works|residentCitiesForNation/);
  assert.match(readFileSync('app/page.tsx', 'utf8'), /bindRuelWorksEnv/);
  assert.match(readFileSync('tests/flag-off-audit-384.test.mjs', 'utf8'), new RegExp(FLAG));
});

test('flag off: enroll, travel, home and the panel omit Ruel Works; flag on: resident city, no imports and no sea lanes', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const offPanel = await r.call('city', 'alice');
  assert.equal(offPanel.data.currentCityId, 'forgehaven');
  assert.equal(JSON.stringify(offPanel.data).includes('ruel-works'), false);
  assert.equal((await r.call('citizen', 'alice')).data.flags.ruelWorks, undefined);
  openConfluence(r);
  const lane = await r.call('citizen', 'lane', { action: 'enroll', nationId: 'confluence', expectedNationId: null });
  assert.equal(lane.status, 200, JSON.stringify(lane.data));
  const refused = await r.call('citizen', 'refused', { action: 'enroll', nationId: 'confluence', expectedNationId: null, cityId: 'ruel-works' });
  assert.equal(refused.status, 403);
  assert.equal(refused.data.reason, 'not_in_nation');
  assert.equal((await r.call('city', 'lane', { action: 'travel', cityId: 'ruel-works' })).status, 400);
  r.setFixtureEnv('HARIMU_HOME_CITY_MOVE_ENABLED', 'true');
  assert.equal((await r.call('city-home', 'lane', { cityId: 'ruel-works', requestId: randomUUID() })).data.reason, 'not_your_nation');
  const capital = await r.call('city', 'lane');
  assert.equal(capital.data.currentCityId, 'meetwater');
  assert.equal(JSON.stringify(capital.data).includes('ruel-works'), false);

  r.setFixtureEnv(FLAG, 'true');
  assert.equal((await r.call('citizen', 'alice')).data.flags.ruelWorks, true);
  const enrolled = await r.call('citizen', 'works', { action: 'enroll', nationId: 'confluence', expectedNationId: null, cityId: 'ruel-works' });
  assert.equal(enrolled.status, 200, JSON.stringify(enrolled.data));
  r.setFixtureEnv('HARIMU_CITY_SPECIALTY_NOTE_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_CITY_CAPTURE_NOTE_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_CITY_CIVIC_UNIT_NOTE_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_CITY_IMPORTS_NOTE_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_SEASON_SEA_LANES_ENABLED', 'true');
  const epochSec = Math.floor((r.now - (seasonOrder.indexOf('winter') * seasonLengthMs + 3_600_000)) / 1000);
  await r.db.prepare("INSERT INTO world_clock (id,epoch_seconds) VALUES ('main',?) ON CONFLICT(id) DO UPDATE SET epoch_seconds=excluded.epoch_seconds").bind(epochSec).run();
  const home = await r.call('city', 'works');
  assert.equal(home.data.homeCityId, 'ruel-works');
  assert.equal(home.data.currentCityId, 'ruel-works');
  assert.equal(home.data.specialtyRole, 'Industry');
  assert.equal(home.data.captureNote, HEARTLAND_CAPTURE_NOTE);
  assert.equal(home.data.civicUnitNote, 'voting district');
  assert.equal('importsNote' in home.data, false);
  assert.equal('seaLanesNote' in home.data, false);
  assert.equal(JSON.stringify(home.data).includes('Hosts '), false);
  assert.deepEqual(home.data.presence.map(p => p.cityId), ids, 'the presence list stays the catalog');
  const travel = await r.call('city', 'lane', { action: 'travel', cityId: 'ruel-works' });
  assert.equal(travel.status, 200, JSON.stringify(travel.data));
  assert.equal(travel.data.currentCityId, 'ruel-works');
  assert.equal('importsNote' in travel.data, false);
  assert.equal('seaLanesNote' in travel.data, false);
  const named = await r.call('city-home', 'lane', { cityId: 'ruel-works', requestId: randomUUID() });
  assert.equal(named.status, 403);
  assert.equal(named.data.reason, 'not_open_yet', 'the city is recognized; Confluence has no home-move wallet currency');
  assert.deepEqual(citiesForNation('confluence').map(c => c.id), ids);
  r.setFixtureEnv(FLAG, 'false');
  assert.equal((await r.call('citizen', 'alice')).data.flags.ruelWorks, undefined);
  const hidden = await r.call('city', 'works');
  assert.equal(hidden.data.currentCityId, 'meetwater');
  assert.equal(JSON.stringify(hidden.data).includes('ruel-works'), false);
});
