/** #1282: Dunkar Pass, Varkand resident city behind HARIMU_VARKAND_DUNKAR_PASS_ENABLED.
 *  Flag off: residentCitiesForNation, cityForNation, enroll, home, travel and the city panel match today.
 *  Not a country-map pin. citiesForNation('varkand') stays capital plus two. No imports and no war or capture hooks.
 *  [ASSUMPTION] description joins the docs Look and Region columns and omits the Fog Gate.
 *  [ASSUMPTION] enrollment can record Dunkar Pass as home; a paid home move stays not_open_yet because Varkand has no home-move currency. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { bindDaoWorksEnv, bindDunkarPassEnv, bindMarrowMillsEnv, bindRuelWorksEnv, bindThessalyWellsEnv, bindVakkHarborEnv, citiesForNation, cityCaptureNote, cityCivicUnitNote, cityForNation, cityHasImports, cityImportsNote, citySpecialtyFields, DAO_WORKS_FLAG, DUNKAR_PASS_FLAG, HEARTLAND_CAPTURE_NOTE, MARROW_MILLS_FLAG, residentCitiesForNation, RUEL_WORKS_FLAG, THESSALY_WELLS_FLAG, VAKK_HARBOR_FLAG } from '../lib/cities.ts';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import { seasonLengthMs, seasonOrder } from '../lib/game-season.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const FLAG = DUNKAR_PASS_FLAG;
const LANTERN = 'HARIMU_VARKAND_LANTERN_WATCH_ENABLED';
const MUSTER = 'HARIMU_VARKAND_MUSTER_DAY_ENABLED';
const ids = ['watchfast', 'voren-light', 'moorhald'];
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1'));
const clear = () => { bindDunkarPassEnv(undefined); bindRuelWorksEnv(undefined); bindThessalyWellsEnv(undefined); bindVakkHarborEnv(undefined); bindDaoWorksEnv(undefined); bindMarrowMillsEnv(undefined); delete process.env[FLAG]; delete process.env[RUEL_WORKS_FLAG]; delete process.env[THESSALY_WELLS_FLAG]; delete process.env[VAKK_HARBOR_FLAG]; delete process.env[DAO_WORKS_FLAG]; delete process.env[MARROW_MILLS_FLAG]; delete process.env[LANTERN]; delete process.env[MUSTER]; };
const openVarkand = r => {
  r.setFixtureEnv('HARIMU_VARKAND_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_NATION_READINESS_ENABLED', 'false');
  r.setFixtureEnv('HARIMU_QA_TEST_CITIZENS', 'true');
  r.setFixtureEnv('NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW', 'true');
  r.setFixtureEnv('HARIMU_QA_TEST_CITIZEN_IDS', 'lane,refused,pass');
  r.setFixtureEnv('HARIMU_ENROLL_HOME_CITY_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_HOME_CITY_MOVE_ENABLED', 'true');
};

test('flag off: no resident city; flag on: Military base, heartland, garrison district, no imports; catalog unchanged either way', () => {
  clear();
  assert.deepEqual(citiesForNation('varkand').map(c => c.id), ids);
  assert.deepEqual(residentCitiesForNation('varkand').map(c => c.id), ids);
  assert.equal(cityForNation('varkand', 'dunkar-pass'), undefined);
  bindDunkarPassEnv({ [FLAG]: 'true' });
  try {
    assert.deepEqual(citiesForNation('varkand').map(c => c.id), ids, 'flag on leaves the capital-plus-two catalog');
    const city = cityForNation('varkand', 'dunkar-pass');
    assert.equal(city?.name, 'Dunkar Pass');
    assert.equal(city.nationId, 'varkand');
    assert.equal(city.role, 'Military base');
    assert.equal(city.capital, false);
    assert.equal(city.spa, undefined);
    assert.equal(city.description, 'Fortified pass with searchlights on the eastern mountain pass.');
    assert.equal(citySpecialtyFields('varkand', 'dunkar-pass').specialtyRole, 'Military base');
    assert.equal(cityCaptureNote('varkand', 'dunkar-pass'), HEARTLAND_CAPTURE_NOTE);
    assert.equal(cityCivicUnitNote('varkand'), 'garrison district');
    assert.equal(cityHasImports(city), false);
    assert.equal(cityImportsNote(city), null);
    assert.deepEqual(residentCitiesForNation('varkand').map(c => c.id), [...ids, 'dunkar-pass']);
    assert.equal(residentCitiesForNation('kindle').some(c => c.id === 'dunkar-pass'), false);
  } finally { clear(); }
  bindDunkarPassEnv({ HARIMU_GRAY_PACK: { [FLAG]: 'true' }, [FLAG]: 'false' });
  assert.equal(cityForNation('varkand', 'dunkar-pass'), undefined, 'a direct string wins');
  clear();
});

test('Ruel Works on does not open Dunkar Pass', () => {
  clear();
  const sibling = { [FLAG]: 'false', [RUEL_WORKS_FLAG]: 'true' };
  bindDunkarPassEnv(sibling);
  bindRuelWorksEnv(sibling);
  try {
    assert.equal(cityForNation('confluence', 'ruel-works')?.id, 'ruel-works', 'the sibling flag is on');
    assert.equal(cityForNation('varkand', 'dunkar-pass'), undefined);
    assert.deepEqual(residentCitiesForNation('varkand').map(c => c.id), ids);
    assert.equal(residentCitiesForNation('varkand').some(c => c.id === 'dunkar-pass'), false);
    assert.deepEqual(citiesForNation('varkand').map(c => c.id), ids);
  } finally { clear(); }
});

test('Varkand Lantern Watch and Muster Day on do not open Dunkar Pass', () => {
  clear();
  const sibling = { [FLAG]: 'false', [LANTERN]: 'true', [MUSTER]: 'true' };
  bindDunkarPassEnv(sibling);
  try {
    assert.equal(flagOn(sibling, LANTERN), true);
    assert.equal(flagOn(sibling, MUSTER), true);
    assert.equal(flagOn(sibling, FLAG), false);
    assert.equal(cityForNation('varkand', 'dunkar-pass'), undefined);
    assert.deepEqual(residentCitiesForNation('varkand').map(c => c.id), ids);
    assert.equal(residentCitiesForNation('varkand').some(c => c.id === 'dunkar-pass'), false);
    assert.deepEqual(citiesForNation('varkand').map(c => c.id), ids);
  } finally { clear(); }
});

test('Vakk Harbor on does not open Dunkar Pass', () => {
  clear();
  const sibling = { [FLAG]: 'false', [VAKK_HARBOR_FLAG]: 'true' };
  bindDunkarPassEnv(sibling);
  bindVakkHarborEnv(sibling);
  try {
    assert.equal(cityForNation('hoarvale', 'vakk-harbor')?.id, 'vakk-harbor', 'the sibling flag is on');
    assert.equal(cityForNation('varkand', 'dunkar-pass'), undefined);
    assert.deepEqual(residentCitiesForNation('varkand').map(c => c.id), ids);
    assert.equal(residentCitiesForNation('varkand').some(c => c.id === 'dunkar-pass'), false);
    assert.deepEqual(citiesForNation('varkand').map(c => c.id), ids);
  } finally { clear(); }
});

test('Dao Works on does not open Dunkar Pass', () => {
  clear();
  const sibling = { [FLAG]: 'false', [DAO_WORKS_FLAG]: 'true' };
  bindDunkarPassEnv(sibling);
  bindDaoWorksEnv(sibling);
  try {
    assert.equal(cityForNation('meridian', 'dao-works')?.id, 'dao-works', 'the sibling flag is on');
    assert.equal(cityForNation('varkand', 'dunkar-pass'), undefined);
    assert.deepEqual(residentCitiesForNation('varkand').map(c => c.id), ids);
    assert.equal(residentCitiesForNation('varkand').some(c => c.id === 'dunkar-pass'), false);
    assert.deepEqual(citiesForNation('varkand').map(c => c.id), ids);
  } finally { clear(); }
});

test('Marrow Mills on does not open Dunkar Pass', () => {
  clear();
  const sibling = { [FLAG]: 'false', [MARROW_MILLS_FLAG]: 'true' };
  bindDunkarPassEnv(sibling);
  bindMarrowMillsEnv(sibling);
  try {
    assert.equal(cityForNation('veldwood', 'marrow-mills')?.id, 'marrow-mills', 'the sibling flag is on');
    assert.equal(cityForNation('varkand', 'dunkar-pass'), undefined);
    assert.deepEqual(residentCitiesForNation('varkand').map(c => c.id), ids);
    assert.equal(residentCitiesForNation('varkand').some(c => c.id === 'dunkar-pass'), false);
    assert.deepEqual(citiesForNation('varkand').map(c => c.id), ids);
  } finally { clear(); }
});

test('Thessaly Wells on does not open Dunkar Pass', () => {
  clear();
  const sibling = { [FLAG]: 'false', [THESSALY_WELLS_FLAG]: 'true' };
  bindDunkarPassEnv(sibling);
  bindThessalyWellsEnv(sibling);
  try {
    assert.equal(cityForNation('ilmar', 'thessaly-wells')?.id, 'thessaly-wells', 'the resident-city sibling flag is on');
    assert.equal(cityForNation('varkand', 'dunkar-pass'), undefined);
    assert.deepEqual(residentCitiesForNation('varkand').map(c => c.id), ids);
    assert.equal(residentCitiesForNation('varkand').some(c => c.id === 'dunkar-pass'), false);
    assert.deepEqual(citiesForNation('varkand').map(c => c.id), ids);
  } finally { clear(); }
});

test('the flag is at(-2) in HARIMU_GRAY_PACK, preview true and production false, and the map stays three pins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[FLAG], undefined);
  assert.equal(prod.vars[FLAG], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[FLAG], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[FLAG], 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-2), FLAG);
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-2), FLAG);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-2), FLAG);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-3), 'HARIMU_MERIDIAN_DAO_WORKS_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-4), 'HARIMU_VELDWOOD_MARROW_MILLS_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-5), 'HARIMU_ILMAR_THESSALY_WELLS_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-6), 'HARIMU_CONFLUENCE_RUEL_WORKS_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-7), 'HARIMU_HOARVALE_VAKK_HARBOR_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.length, 82); // GRAY 82. #1279 Dao Works is 80. Dunkar Pass is 81; Better Auth is last
  const scene = readFileSync('app/country-scene.tsx', 'utf8');
  assert.match(scene, /citiesForNation\(nationId\)/);
  assert.match(scene, /\{x:50,y:32\},\{x:26,y:76\},\{x:76,y:76\}/);
  assert.doesNotMatch(scene, /dunkar-pass|residentCitiesForNation/);
  assert.match(readFileSync('app/page.tsx', 'utf8'), /bindDunkarPassEnv/);
  assert.match(readFileSync('tests/flag-off-audit-384.test.mjs', 'utf8'), new RegExp(FLAG));
  assert.equal(readFileSync('lib/home-move.ts', 'utf8').includes("varkand:"), false, 'Varkand stays out of homeMoveCurrencies');
});

test('flag off: enroll, travel, home and the panel omit Dunkar Pass; flag on: resident city, and a paid home move is not_open_yet', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  r.setFixtureEnv(FLAG, 'false');
  r.setFixtureEnv(RUEL_WORKS_FLAG, 'true');
  r.setFixtureEnv(VAKK_HARBOR_FLAG, 'false');
  r.setFixtureEnv(THESSALY_WELLS_FLAG, 'false');
  const ruelFlags = (await r.call('citizen', 'alice')).data.flags;
  assert.equal(ruelFlags.ruelWorks, true, 'Ruel Works is on');
  assert.equal(ruelFlags.dunkarPass, undefined, 'Ruel Works does not open flags.dunkarPass');
  r.setFixtureEnv(RUEL_WORKS_FLAG, 'false');
  r.setFixtureEnv(VAKK_HARBOR_FLAG, 'true');
  const vakkFlags = (await r.call('citizen', 'alice')).data.flags;
  assert.equal(vakkFlags.vakkHarbor, true, 'Vakk Harbor is on');
  assert.equal(vakkFlags.ruelWorks, undefined);
  assert.equal(vakkFlags.dunkarPass, undefined, 'Vakk Harbor does not open flags.dunkarPass');
  r.setFixtureEnv(VAKK_HARBOR_FLAG, 'false');
  r.setFixtureEnv(DAO_WORKS_FLAG, 'true');
  const daoFlags = (await r.call('citizen', 'alice')).data.flags;
  assert.equal(daoFlags.daoWorks, true, 'Dao Works is on');
  assert.equal(daoFlags.dunkarPass, undefined, 'Dao Works does not open flags.dunkarPass');
  r.setFixtureEnv(DAO_WORKS_FLAG, 'false');
  r.setFixtureEnv(MARROW_MILLS_FLAG, 'true');
  const marrowFlags = (await r.call('citizen', 'alice')).data.flags;
  assert.equal(marrowFlags.marrowMills, true, 'Marrow Mills is on');
  assert.equal(marrowFlags.daoWorks, undefined);
  assert.equal(marrowFlags.dunkarPass, undefined, 'Marrow Mills does not open flags.dunkarPass');
  r.setFixtureEnv(MARROW_MILLS_FLAG, 'false');
  r.setFixtureEnv(THESSALY_WELLS_FLAG, 'true');
  r.setFixtureEnv(LANTERN, 'true');
  r.setFixtureEnv(MUSTER, 'true');
  r.setFixtureEnv(FLAG, 'false');
  const siblingFlags = (await r.call('citizen', 'alice')).data.flags;
  assert.equal(siblingFlags.thessalyWells, true, 'the shipped resident-city sibling is on');
  assert.equal(siblingFlags.dunkarPass, undefined, 'Lantern Watch, Muster Day, and Thessaly Wells do not open Dunkar Pass');
  await r.db.prepare("UPDATE citizens SET nation_id='varkand' WHERE clerk_user_id='alice'").run();
  const offPanel = await r.call('city', 'alice');
  assert.equal(offPanel.data.currentCityId, 'watchfast');
  assert.equal(JSON.stringify(offPanel.data).includes('dunkar-pass'), false);
  assert.equal(JSON.stringify(offPanel.data).includes('Dunkar Pass'), false);
  assert.equal((await r.call('citizen', 'alice')).data.flags.dunkarPass, undefined);
  assert.equal((await r.call('city', 'alice', { action: 'travel', cityId: 'dunkar-pass' })).status, 400);
  r.setFixtureEnv('HARIMU_HOME_CITY_MOVE_ENABLED', 'true');
  assert.equal((await r.call('city-home', 'alice', { cityId: 'dunkar-pass', requestId: randomUUID() })).data.reason, 'not_your_nation');
  openVarkand(r);
  const refused = await r.call('citizen', 'refused', { action: 'enroll', nationId: 'varkand', expectedNationId: null, cityId: 'dunkar-pass' });
  assert.equal(refused.status, 403);
  assert.equal(refused.data.reason, 'not_in_nation');
  const lane = await r.call('citizen', 'lane', { action: 'enroll', nationId: 'varkand', expectedNationId: null });
  assert.equal(lane.status, 200, JSON.stringify(lane.data));
  const capital = await r.call('city', 'lane');
  assert.equal(capital.data.currentCityId, 'watchfast');
  assert.equal(JSON.stringify(capital.data).includes('dunkar-pass'), false);

  r.setFixtureEnv(FLAG, 'true');
  assert.equal((await r.call('citizen', 'alice')).data.flags.dunkarPass, true);
  const enrolled = await r.call('citizen', 'pass', { action: 'enroll', nationId: 'varkand', expectedNationId: null, cityId: 'dunkar-pass' });
  assert.equal(enrolled.status, 200, JSON.stringify(enrolled.data));
  r.setFixtureEnv('HARIMU_CITY_SPECIALTY_NOTE_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_CITY_CAPTURE_NOTE_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_CITY_CIVIC_UNIT_NOTE_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_CITY_IMPORTS_NOTE_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_SEASON_SEA_LANES_ENABLED', 'true');
  const epochSec = Math.floor((r.now - (seasonOrder.indexOf('winter') * seasonLengthMs + 3_600_000)) / 1000);
  await r.db.prepare("INSERT INTO world_clock (id,epoch_seconds) VALUES ('main',?) ON CONFLICT(id) DO UPDATE SET epoch_seconds=excluded.epoch_seconds").bind(epochSec).run();
  const home = await r.call('city', 'pass');
  assert.equal(home.data.homeCityId, 'dunkar-pass');
  assert.equal(home.data.currentCityId, 'dunkar-pass');
  assert.equal(home.data.specialtyRole, 'Military base');
  assert.equal(home.data.captureNote, HEARTLAND_CAPTURE_NOTE);
  assert.equal(home.data.civicUnitNote, 'garrison district');
  assert.equal('importsNote' in home.data, false);
  assert.equal('seaLanesNote' in home.data, false);
  assert.equal(JSON.stringify(home.data).includes('Hosts '), false);
  assert.deepEqual(home.data.presence.map(p => p.cityId), ids, 'the presence list stays the catalog');
  const travel = await r.call('city', 'lane', { action: 'travel', cityId: 'dunkar-pass' });
  assert.equal(travel.status, 200, JSON.stringify(travel.data));
  assert.equal(travel.data.currentCityId, 'dunkar-pass');
  assert.equal('importsNote' in travel.data, false);
  assert.equal('seaLanesNote' in travel.data, false);
  const named = await r.call('city-home', 'lane', { cityId: 'dunkar-pass', requestId: randomUUID() });
  assert.equal(named.status, 403);
  assert.equal(named.data.reason, 'not_open_yet', 'the city is recognized; Varkand has no home-move wallet currency');
  assert.deepEqual(citiesForNation('varkand').map(c => c.id), ids);
  r.setFixtureEnv(FLAG, 'false');
  assert.equal((await r.call('citizen', 'alice')).data.flags.dunkarPass, undefined);
  const hidden = await r.call('city', 'pass');
  assert.equal(hidden.data.currentCityId, 'watchfast');
  assert.equal(JSON.stringify(hidden.data).includes('dunkar-pass'), false);
  assert.equal(JSON.stringify(hidden.data).includes('Dunkar Pass'), false);
});
