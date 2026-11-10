/** #1261: Vakk Harbor is a Hoarvale resident city behind HARIMU_HOARVALE_VAKK_HARBOR_ENABLED.
 *  Flag off: residentCitiesForNation, cityForNation, enroll, home, travel and the city panel match today.
 *  No country-map pin. citiesForNation('hoarvale') stays capital plus two. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { bindBrasswellPortEnv, bindVakkHarborEnv, BRASSWELL_PORT_FLAG, citiesForNation, cityCaptureNote, cityForNation, cityHasImports, cityImportsNote, HEARTLAND_CAPTURE_NOTE, residentCitiesForNation, VAKK_HARBOR_FLAG } from '../lib/cities.ts';
import { FLAG_PACKS } from '../lib/flag-pack.mjs';
import { seasonLengthMs, seasonOrder } from '../lib/game-season.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const FLAG = VAKK_HARBOR_FLAG;
const PORT_NOTE = 'Port market: foreign imports arrive here.';
const hoarvaleIds = ['rimehall', 'fjeldmark', 'isling-springs'];
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1'));
const clear = () => { bindVakkHarborEnv(undefined); bindBrasswellPortEnv(undefined); delete process.env[FLAG]; delete process.env[BRASSWELL_PORT_FLAG]; };
const openHoarvale = r => {
  r.setFixtureEnv('HARIMU_HOARVALE_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_NATION_READINESS_ENABLED', 'false');
  r.setFixtureEnv('HARIMU_QA_TEST_CITIZENS', 'true');
  r.setFixtureEnv('NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW', 'true');
  r.setFixtureEnv('HARIMU_QA_TEST_CITIZEN_IDS', 'harbor');
  r.setFixtureEnv('HARIMU_ENROLL_HOME_CITY_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_HOME_CITY_MOVE_ENABLED', 'true');
};

test('flag off: no resident city; flag on: port resident, imports, heartland; catalog unchanged either way', () => {
  clear();
  assert.deepEqual(citiesForNation('hoarvale').map(c => c.id), hoarvaleIds);
  assert.deepEqual(residentCitiesForNation('hoarvale').map(c => c.id), hoarvaleIds);
  assert.equal(cityForNation('hoarvale', 'vakk-harbor'), undefined);
  process.env[FLAG] = 'true';
  try {
    assert.deepEqual(citiesForNation('hoarvale').map(c => c.id), hoarvaleIds, 'flag on leaves the capital-plus-two catalog');
    const port = cityForNation('hoarvale', 'vakk-harbor');
    assert.equal(port?.name, 'Vakk Harbor');
    assert.equal(port.nationId, 'hoarvale');
    assert.equal(port.role, 'Port / fisheries');
    assert.equal(port.capital, false);
    assert.equal(port.spa, undefined);
    assert.equal(port.description, 'Timber wharves and fish-drying racks on the western fjord coast.');
    assert.equal(cityHasImports(port), true);
    assert.equal(cityImportsNote(port), PORT_NOTE);
    assert.equal(cityCaptureNote('hoarvale', 'vakk-harbor'), HEARTLAND_CAPTURE_NOTE);
    assert.deepEqual(residentCitiesForNation('hoarvale').map(c => c.id), [...hoarvaleIds, 'vakk-harbor']);
    assert.equal(residentCitiesForNation('kindle').some(c => c.id === 'vakk-harbor'), false);
  } finally { clear(); }
  bindVakkHarborEnv({ HARIMU_GRAY_PACK: { [FLAG]: 'true' }, [FLAG]: 'false' });
  assert.equal(cityForNation('hoarvale', 'vakk-harbor'), undefined, 'a direct string wins');
  clear();
});

test('Brasswell Port on with Vakk Harbor off: Hoarvale lists still exclude vakk-harbor', async t => {
  const shared = { [BRASSWELL_PORT_FLAG]: 'true', [FLAG]: 'false' };
  bindBrasswellPortEnv(shared);
  bindVakkHarborEnv(shared);
  try {
    assert.equal(cityForNation('hoarvale', 'vakk-harbor'), undefined);
    assert.deepEqual(residentCitiesForNation('hoarvale').map(c => c.id), hoarvaleIds);
    assert.deepEqual(citiesForNation('hoarvale').map(c => c.id), hoarvaleIds);
    assert.equal(cityForNation('kindle', 'brasswell-port')?.id, 'brasswell-port', 'the Brasswell flag is on');
  } finally { clear(); }

  const r = await localRuntime(); t.after(() => r.close());
  r.setFixtureEnv(BRASSWELL_PORT_FLAG, 'true');
  r.setFixtureEnv(FLAG, 'false');
  await r.db.prepare("UPDATE citizens SET nation_id='hoarvale' WHERE clerk_user_id='alice'").run();
  const panel = await r.call('city', 'alice');
  assert.equal(panel.data.currentCityId, 'rimehall');
  assert.equal(JSON.stringify(panel.data).includes('vakk'), false);
  const flags = (await r.call('citizen', 'alice')).data.flags;
  assert.equal(flags.brasswellPort, true);
  assert.equal(flags.vakkHarbor, undefined);
  assert.equal((await r.call('city', 'alice', { action: 'travel', cityId: 'vakk-harbor' })).status, 400);
  openHoarvale(r);
  r.setFixtureEnv(BRASSWELL_PORT_FLAG, 'true');
  r.setFixtureEnv(FLAG, 'false');
  assert.equal((await r.call('city-home', 'alice', { cityId: 'vakk-harbor', requestId: randomUUID() })).data.reason, 'not_your_nation');
  const refused = await r.call('citizen', 'harbor', { action: 'enroll', nationId: 'hoarvale', expectedNationId: null, cityId: 'vakk-harbor' });
  assert.equal(refused.status, 403);
  assert.equal(refused.data.reason, 'not_in_nation');
});

test('the flag is preview true and production false, at(-3) in HARIMU_GRAY_PACK, and the map stays three pins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[FLAG], undefined);
  assert.equal(prod.vars[FLAG], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[FLAG], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[FLAG], 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-3), FLAG);
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-3), FLAG);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-3), FLAG);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-4), 'HARIMU_ILMAR_LONG_LIGHT_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.length, 78);
  const scene = readFileSync('app/country-scene.tsx', 'utf8');
  assert.match(scene, /citiesForNation\(nationId\)/);
  assert.match(scene, /\{x:50,y:32\},\{x:26,y:76\},\{x:76,y:76\}/);
  assert.doesNotMatch(scene, /vakk-harbor|residentCitiesForNation/);
  assert.match(readFileSync('app/page.tsx', 'utf8'), /bindVakkHarborEnv/);
  assert.match(readFileSync('tests/flag-off-audit-384.test.mjs', 'utf8'), new RegExp(FLAG));
});

test('flag off: enroll, travel, home and the panel omit the port; flag on: resident city and the port market note', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  await r.db.prepare("UPDATE citizens SET nation_id='hoarvale' WHERE clerk_user_id='alice'").run();
  const offPanel = await r.call('city', 'alice');
  assert.equal(offPanel.data.currentCityId, 'rimehall');
  assert.equal(JSON.stringify(offPanel.data).includes('vakk'), false);
  assert.equal((await r.call('citizen', 'alice')).data.flags.vakkHarbor, undefined);
  assert.equal((await r.call('city', 'alice', { action: 'travel', cityId: 'vakk-harbor' })).status, 400);
  r.setFixtureEnv('HARIMU_HOME_CITY_MOVE_ENABLED', 'true');
  assert.equal((await r.call('city-home', 'alice', { cityId: 'vakk-harbor', requestId: randomUUID() })).data.reason, 'not_your_nation');
  openHoarvale(r);
  const refused = await r.call('citizen', 'harbor', { action: 'enroll', nationId: 'hoarvale', expectedNationId: null, cityId: 'vakk-harbor' });
  assert.equal(refused.status, 403);
  assert.equal(refused.data.reason, 'not_in_nation');

  r.setFixtureEnv(FLAG, 'true');
  assert.equal((await r.call('citizen', 'alice')).data.flags.vakkHarbor, true);
  const enrolled = await r.call('citizen', 'harbor', { action: 'enroll', nationId: 'hoarvale', expectedNationId: null, cityId: 'vakk-harbor' });
  assert.equal(enrolled.status, 200, JSON.stringify(enrolled.data));
  r.setFixtureEnv('HARIMU_CITY_IMPORTS_NOTE_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_CITY_SPECIALTY_NOTE_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_CITY_CAPTURE_NOTE_ENABLED', 'true');
  const home = await r.call('city', 'harbor');
  assert.equal(home.data.homeCityId, 'vakk-harbor');
  assert.equal(home.data.currentCityId, 'vakk-harbor');
  assert.equal(home.data.importsNote, PORT_NOTE);
  assert.equal(home.data.specialtyRole, 'Port / fisheries');
  assert.equal(home.data.captureNote, HEARTLAND_CAPTURE_NOTE);
  const travel = await r.call('city', 'alice', { action: 'travel', cityId: 'vakk-harbor' });
  assert.equal(travel.status, 200, JSON.stringify(travel.data));
  assert.equal(travel.data.currentCityId, 'vakk-harbor');
  assert.equal(travel.data.importsNote, PORT_NOTE);
  const moved = await r.call('city-home', 'alice', { cityId: 'vakk-harbor', requestId: randomUUID() });
  assert.equal(moved.data.reason, 'not_open_yet', 'the city is accepted; Hoarvale still has no wallet currency');
  const already = await r.call('city-home', 'harbor', { cityId: 'vakk-harbor', requestId: randomUUID() });
  assert.equal(already.data.reason, 'already_home');
  assert.deepEqual(citiesForNation('hoarvale').map(c => c.id), hoarvaleIds);
});

test('flag on plus sea lanes in winter: freight from Vakk Harbor takes the existing port multiplier', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  await r.db.prepare("UPDATE work_orders SET nation_id='hoarvale' WHERE id='freight'").run();
  const clock = async season => {
    const epochSec = Math.floor((r.now - (seasonOrder.indexOf(season) * seasonLengthMs + 3_600_000)) / 1000);
    await r.db.prepare("INSERT INTO world_clock (id,epoch_seconds) VALUES ('main',?) ON CONFLICT(id) DO UPDATE SET epoch_seconds=excluded.epoch_seconds").bind(epochSec).run();
  };
  const pay = async user => {
    await r.db.prepare('UPDATE work_shifts SET claimed_at=? WHERE clerk_user_id=? AND claimed_at IS NULL').bind(new Date(r.now).toISOString(), user).run();
    await r.db.prepare('UPDATE citizens SET nation_id=?, capacity=100 WHERE clerk_user_id=?').bind('hoarvale', user).run();
    const started = await r.call('citizen', user, { action: 'commit-work', workOrderId: 'freight' });
    assert.equal(started.status, 200, JSON.stringify(started.data));
    return started.data.shifts.find(s => !s.claimedAt).rewardQuantity;
  };
  r.setFixtureEnv(FLAG, 'true');
  r.setFixtureEnv('HARIMU_SEASON_SEA_LANES_ENABLED', 'true');
  await clock('winter');
  const arrived = await r.call('city', 'alice', { action: 'travel', cityId: 'vakk-harbor' });
  assert.equal(arrived.status, 400, 'travel follows the citizen nation; alice is still Kindle');
  await r.db.prepare("UPDATE citizens SET nation_id='hoarvale' WHERE clerk_user_id='alice'").run();
  const port = await r.call('city', 'alice', { action: 'travel', cityId: 'vakk-harbor' });
  assert.equal(port.data.currentCityId, 'vakk-harbor');
  assert.match(port.data.seaLanesNote, /^Winter storms: sea freight slowed until spring \(.+ left\)\.$/);
  assert.equal(await pay('alice'), 1, 'winter port freight floor(q*80/100)');
  await clock('summer');
  assert.equal(await pay('alice'), 2, 'summer port freight is unchanged');
  r.setFixtureEnv(FLAG, 'false');
  await clock('winter');
  await r.db.prepare(`INSERT INTO citizen_city_locations(user_id,nation_id,home_city_id,current_city_id,updated_at) VALUES ('bob','hoarvale','rimehall','vakk-harbor',1)
    ON CONFLICT(user_id) DO UPDATE SET nation_id='hoarvale', current_city_id='vakk-harbor'`).run();
  assert.equal(await pay('bob'), 2, 'flag off: a stored port id is not a port');
});
