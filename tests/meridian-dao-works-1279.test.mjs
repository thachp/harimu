/** #1279: Dao Works is a Meridian resident city behind HARIMU_MERIDIAN_DAO_WORKS_ENABLED.
 *  Flag off: residentCitiesForNation, cityForNation, enroll, home, travel and the city panel match today.
 *  Flag on: specialty "Heavy industry", the existing non-port specialty sentence, the heartland capture note, and cityHasImports false.
 *  citiesForNation('meridian') stays capital plus two. Shen Springs stays a spa resident. No country-map pin. No civic-unit note. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { bindDaoWorksEnv, bindVakkHarborEnv, citiesForNation, cityCaptureNote, cityCivicUnitNote, cityForNation, cityHasImports, cityImportsNote, citySpecialtyFields, DAO_WORKS_FLAG, HEARTLAND_CAPTURE_NOTE, residentCitiesForNation, VAKK_HARBOR_FLAG } from '../lib/cities.ts';
import { FLAG_PACKS } from '../lib/flag-pack.mjs';
import { localRuntime } from './helpers/local-runtime.mjs';

const FLAG = DAO_WORKS_FLAG;
const SPECIALTY = 'Heavy industry';
const SPECIALTY_NOTE = "Jobs here match this city's specialty.";
const DESCRIPTION = 'Slate factory blocks with slogan banners on the western plain.';
const SHEN = 'Hot-spring terraces and white bathhouses in the northern foothills.';
const catalogIds = ['steamgate', 'tsenga-sez', 'holv-gorge'];
const residentOff = [...catalogIds, 'shen-springs'];
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1'));
const clear = () => { bindDaoWorksEnv(undefined); bindVakkHarborEnv(undefined); delete process.env[FLAG]; delete process.env[VAKK_HARBOR_FLAG]; };
const openMeridian = r => {
  r.setFixtureEnv('HARIMU_MERIDIAN_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_NATION_READINESS_ENABLED', 'false');
  r.setFixtureEnv('HARIMU_QA_TEST_CITIZENS', 'true');
  r.setFixtureEnv('NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW', 'true');
  r.setFixtureEnv('HARIMU_QA_TEST_CITIZEN_IDS', 'dao-off,dao-on,vale');
};
const shenStays = () => {
  const shen = cityForNation('meridian', 'shen-springs');
  assert.equal(shen?.name, 'Shen Springs');
  assert.equal(shen.spa, true);
  assert.equal(shen.role, 'Health / tourism');
  assert.equal(shen.description, SHEN);
  assert.equal(citiesForNation('meridian').some(c => c.id === 'shen-springs'), false);
};

test('flag off: no resident city; flag on: heavy industry, no imports, heartland; catalog and Shen Springs unchanged', () => {
  clear();
  assert.deepEqual(citiesForNation('meridian').map(c => c.id), catalogIds);
  assert.deepEqual(residentCitiesForNation('meridian').map(c => c.id), residentOff);
  assert.equal(cityForNation('meridian', 'dao-works'), undefined);
  assert.equal(cityCaptureNote('meridian', 'dao-works'), null);
  assert.equal(cityCivicUnitNote('meridian'), null);
  shenStays();
  process.env[FLAG] = 'true';
  try {
    assert.deepEqual(citiesForNation('meridian').map(c => c.id), catalogIds, 'flag on leaves the capital-plus-two catalog');
    const city = cityForNation('meridian', 'dao-works');
    assert.equal(city?.name, 'Dao Works');
    assert.equal(city.nationId, 'meridian');
    assert.equal(city.role, SPECIALTY);
    assert.equal(city.capital, false);
    assert.equal(city.spa, undefined);
    assert.equal(city.description, DESCRIPTION);
    assert.equal(city.description.includes('Red Foundry'), false);
    assert.equal(cityHasImports(city), false);
    assert.equal(cityImportsNote(city), null);
    assert.equal(citySpecialtyFields('meridian', 'dao-works').specialtyRole, SPECIALTY);
    assert.equal(citySpecialtyFields('meridian', 'dao-works').specialtyNote, SPECIALTY_NOTE);
    assert.equal(cityCaptureNote('meridian', 'dao-works'), HEARTLAND_CAPTURE_NOTE);
    assert.equal(cityCivicUnitNote('meridian'), null, 'Meridian still has no civic-unit note');
    assert.deepEqual(residentCitiesForNation('meridian').map(c => c.id), [...residentOff, 'dao-works']);
    assert.equal(residentCitiesForNation('hoarvale').some(c => c.id === 'dao-works'), false);
    shenStays();
  } finally { clear(); }
  bindDaoWorksEnv({ HARIMU_GRAY_PACK: { [FLAG]: 'true' }, [FLAG]: 'false' });
  assert.equal(cityForNation('meridian', 'dao-works'), undefined, 'a direct string wins');
  clear();
});

test('Vakk Harbor on with Dao Works off: Meridian residents, lookup and the catalog omit dao-works', () => {
  const shared = { [VAKK_HARBOR_FLAG]: 'true', [FLAG]: 'false' };
  bindVakkHarborEnv(shared);
  bindDaoWorksEnv(shared);
  try {
    assert.equal(cityForNation('meridian', 'dao-works'), undefined);
    assert.deepEqual(residentCitiesForNation('meridian').map(c => c.id), residentOff);
    assert.deepEqual(citiesForNation('meridian').map(c => c.id), catalogIds);
    assert.equal(cityForNation('hoarvale', 'vakk-harbor')?.id, 'vakk-harbor', 'the Vakk Harbor flag is on');
    shenStays();
  } finally { clear(); }
});

test('the flag is last in HARIMU_GRAY_PACK, preview true and production false, and the map stays three pins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[FLAG], undefined);
  assert.equal(prod.vars[FLAG], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[FLAG], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[FLAG], 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-4), FLAG);
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-4), FLAG);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-4), FLAG);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-5), 'HARIMU_VELDWOOD_MARROW_MILLS_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf('HARIMU_BETTER_AUTH_ENABLED'), 81); // GRAY 82 is Better Auth; #467 land tiles is last (length is not pinned)
  const scene = readFileSync('app/country-scene.tsx', 'utf8');
  assert.match(scene, /citiesForNation\(nationId\)/);
  assert.match(scene, /\{x:50,y:32\},\{x:26,y:76\},\{x:76,y:76\}/);
  assert.doesNotMatch(scene, /dao-works|residentCitiesForNation/);
  assert.doesNotMatch(readFileSync('lib/mvp-job-types.ts', 'utf8'), /dao-works|Assigned-quota|Red Foundry/);
  assert.match(readFileSync('app/page.tsx', 'utf8'), /bindDaoWorksEnv/);
  assert.match(readFileSync('tests/flag-off-audit-384.test.mjs', 'utf8'), new RegExp(FLAG));
});

test('flag off: enroll, travel, home and the panel omit Dao Works; flag on: resident city, specialty, heartland, and no imports', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  await r.db.prepare("UPDATE citizens SET nation_id='meridian' WHERE clerk_user_id='alice'").run();
  const offPanel = await r.call('city', 'alice');
  assert.equal(offPanel.data.currentCityId, 'steamgate');
  assert.equal(JSON.stringify(offPanel.data).includes('dao-works'), false);
  assert.equal('importsNote' in offPanel.data, false);
  assert.equal('civicUnitNote' in offPanel.data, false);
  assert.equal((await r.call('citizen', 'alice')).data.flags.daoWorks, undefined);
  openMeridian(r);
  r.setFixtureEnv('HARIMU_ENROLL_HOME_CITY_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_HOME_CITY_MOVE_ENABLED', 'true');
  const vale = await r.call('citizen', 'vale', { action: 'enroll', nationId: 'meridian', expectedNationId: null });
  assert.equal(vale.status, 200, JSON.stringify(vale.data));
  const capitalOff = await r.call('city', 'vale');
  assert.equal(capitalOff.data.currentCityId, 'steamgate');
  assert.equal(JSON.stringify(capitalOff.data).includes('dao-works'), false);
  const refused = await r.call('citizen', 'dao-off', { action: 'enroll', nationId: 'meridian', expectedNationId: null, cityId: 'dao-works' });
  assert.equal(refused.status, 403);
  assert.equal(refused.data.reason, 'not_in_nation');
  assert.equal((await r.call('city', 'vale', { action: 'travel', cityId: 'dao-works' })).status, 400);
  assert.equal((await r.call('city-home', 'vale', { cityId: 'dao-works', requestId: randomUUID() })).data.reason, 'not_your_nation');
  r.setFixtureEnv('HARIMU_INTERNAL_PERMIT_ENABLED', 'true');
  assert.equal((await r.call('city-home', 'vale', { action: 'request-permit', cityId: 'dao-works', requestId: randomUUID() })).data.reason, 'not_your_nation');
  r.setFixtureEnv('HARIMU_INTERNAL_PERMIT_ENABLED', undefined);

  r.setFixtureEnv(FLAG, 'true');
  assert.equal((await r.call('citizen', 'alice')).data.flags.daoWorks, true);
  const enrolled = await r.call('citizen', 'dao-on', { action: 'enroll', nationId: 'meridian', expectedNationId: null, cityId: 'dao-works' });
  assert.equal(enrolled.status, 200, JSON.stringify(enrolled.data));
  r.setFixtureEnv('HARIMU_CITY_IMPORTS_NOTE_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_CITY_SPECIALTY_NOTE_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_CITY_CAPTURE_NOTE_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_CITY_CIVIC_UNIT_NOTE_ENABLED', 'true');
  const home = await r.call('city', 'dao-on');
  assert.equal(home.data.homeCityId, 'dao-works');
  assert.equal(home.data.currentCityId, 'dao-works');
  assert.equal('importsNote' in home.data, false);
  assert.equal('civicUnitNote' in home.data, false);
  assert.equal(home.data.specialtyRole, SPECIALTY);
  assert.equal(home.data.specialtyNote, SPECIALTY_NOTE);
  assert.equal(home.data.captureNote, HEARTLAND_CAPTURE_NOTE);
  const capital = await r.call('city', 'vale');
  assert.equal(capital.data.currentCityId, 'steamgate');
  assert.equal(capital.data.specialtyRole, 'Capital');
  assert.equal(JSON.stringify(capital.data).includes('dao-works'), false);
  assert.equal('importsNote' in capital.data, false);
  assert.equal('civicUnitNote' in capital.data, false);
  const travel = await r.call('city', 'vale', { action: 'travel', cityId: 'dao-works' });
  assert.equal(travel.status, 200, JSON.stringify(travel.data));
  assert.equal(travel.data.currentCityId, 'dao-works');
  assert.equal(travel.data.specialtyRole, SPECIALTY);
  assert.equal(travel.data.specialtyNote, SPECIALTY_NOTE);
  assert.equal(travel.data.captureNote, HEARTLAND_CAPTURE_NOTE);
  assert.equal('importsNote' in travel.data, false);
  assert.equal('civicUnitNote' in travel.data, false);
  const already = await r.call('city-home', 'dao-on', { cityId: 'dao-works', requestId: randomUUID() });
  assert.equal(already.data.reason, 'already_home');
  const named = await r.call('city-home', 'vale', { cityId: 'dao-works', requestId: randomUUID() });
  assert.equal(named.status, 403);
  assert.equal(named.data.reason, 'not_open_yet', 'the city is recognized; Meridian still has no wallet currency');
  r.setFixtureEnv('HARIMU_INTERNAL_PERMIT_ENABLED', 'true');
  const blocked = await r.call('city-home', 'vale', { cityId: 'dao-works', requestId: randomUUID() });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.reason, 'permit_required', 'existing #992 permit gate, unchanged');
  const asked = await r.call('city-home', 'vale', { action: 'request-permit', cityId: 'dao-works', requestId: randomUUID() });
  assert.equal(asked.status, 200, JSON.stringify(asked.data));
  assert.equal(asked.data.permit.status, 'pending');
  r.setNow(r.now + 60_000);
  const afterPermit = await r.call('city-home', 'vale', { cityId: 'dao-works', requestId: randomUUID() });
  assert.equal(afterPermit.data.reason, 'not_open_yet', 'a granted permit still meets the existing no-currency refusal');
  assert.deepEqual(citiesForNation('meridian').map(c => c.id), catalogIds);
  shenStays();
  r.setFixtureEnv(FLAG, 'false');
  assert.equal((await r.call('citizen', 'alice')).data.flags.daoWorks, undefined);
  assert.equal(JSON.stringify((await r.call('city', 'alice')).data).includes('dao-works'), false);
  assert.equal((await r.call('city', 'vale', { action: 'travel', cityId: 'tsenga-sez' })).data.currentCityId, 'tsenga-sez');
  assert.equal(JSON.stringify((await r.call('city', 'vale')).data).includes('dao-works'), false);
});

test('Dao Works off and Vakk Harbor on: enroll, home and travel still omit dao-works', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  r.setFixtureEnv(VAKK_HARBOR_FLAG, 'true');
  r.setFixtureEnv(FLAG, 'false');
  await r.db.prepare("UPDATE citizens SET nation_id='meridian' WHERE clerk_user_id='alice'").run();
  const panel = await r.call('city', 'alice');
  assert.equal(panel.data.currentCityId, 'steamgate');
  assert.equal(JSON.stringify(panel.data).includes('dao-works'), false);
  const flags = (await r.call('citizen', 'alice')).data.flags;
  assert.equal(flags.vakkHarbor, true);
  assert.equal(flags.daoWorks, undefined);
  assert.equal((await r.call('city', 'alice', { action: 'travel', cityId: 'dao-works' })).status, 400);
  openMeridian(r);
  r.setFixtureEnv(VAKK_HARBOR_FLAG, 'true');
  r.setFixtureEnv(FLAG, 'false');
  r.setFixtureEnv('HARIMU_ENROLL_HOME_CITY_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_HOME_CITY_MOVE_ENABLED', 'true');
  assert.equal((await r.call('city-home', 'alice', { cityId: 'dao-works', requestId: randomUUID() })).data.reason, 'not_your_nation');
  const refused = await r.call('citizen', 'dao-off', { action: 'enroll', nationId: 'meridian', expectedNationId: null, cityId: 'dao-works' });
  assert.equal(refused.status, 403);
  assert.equal(refused.data.reason, 'not_in_nation');
  assert.deepEqual(citiesForNation('meridian').map(c => c.id), catalogIds);
  assert.equal(cityForNation('meridian', 'dao-works'), undefined);
});
