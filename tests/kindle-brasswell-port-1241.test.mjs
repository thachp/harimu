/** #1241: Brasswell Port is a Kindle resident city behind HARIMU_KINDLE_BRASSWELL_PORT_ENABLED.
 *  Flag off: residentCitiesForNation, cityForNation, enroll, home, travel and the city panel match today.
 *  Not an Assembly district and not a country-map pin. citiesForNation('kindle') stays capital plus two. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { bindBrasswellPortEnv, BRASSWELL_PORT_FLAG, citiesForNation, cityCaptureNote, cityForNation, cityHasImports, cityImportsNote, HEARTLAND_CAPTURE_NOTE, residentCitiesForNation } from '../lib/cities.ts';
import { FLAG_PACKS } from '../lib/flag-pack.mjs';
import { seasonLengthMs, seasonOrder } from '../lib/game-season.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const FLAG = BRASSWELL_PORT_FLAG;
const PORT_NOTE = 'Port market: foreign imports arrive here.';
const kindleIds = ['forgehaven', 'tarrek-foundry', 'kolt-savanna'];
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1'));
const clear = () => { bindBrasswellPortEnv(undefined); delete process.env[FLAG]; };

test('flag off: no resident city; flag on: port resident, imports, heartland; catalog unchanged either way', () => {
  clear();
  assert.deepEqual(citiesForNation('kindle').map(c => c.id), kindleIds);
  assert.deepEqual(residentCitiesForNation('kindle').map(c => c.id), [...kindleIds, 'emberwell']);
  assert.equal(cityForNation('kindle', 'brasswell-port'), undefined);
  process.env[FLAG] = 'true';
  try {
    assert.deepEqual(citiesForNation('kindle').map(c => c.id), kindleIds, 'flag on leaves the Assembly catalog');
    const port = cityForNation('kindle', 'brasswell-port');
    assert.equal(port?.name, 'Brasswell Port');
    assert.equal(port.nationId, 'kindle');
    assert.equal(port.role, 'Port / trade');
    assert.equal(port.capital, false);
    assert.equal(port.spa, undefined);
    assert.equal(port.description, 'Brass cranes and shade-awning docks on black sand along the eastern coast.');
    assert.equal(cityHasImports(port), true);
    assert.equal(cityImportsNote(port), PORT_NOTE);
    assert.equal(cityCaptureNote('kindle', 'brasswell-port'), HEARTLAND_CAPTURE_NOTE);
    assert.deepEqual(residentCitiesForNation('kindle').map(c => c.id), [...kindleIds, 'emberwell', 'brasswell-port']);
    assert.equal(residentCitiesForNation('meridian').some(c => c.id === 'brasswell-port'), false);
  } finally { clear(); }
  bindBrasswellPortEnv({ HARIMU_GRAY_PACK: { [FLAG]: 'true' }, [FLAG]: 'false' });
  assert.equal(cityForNation('kindle', 'brasswell-port'), undefined, 'a direct string wins');
  clear();
});

test('the flag is second to last in HARIMU_GRAY_PACK, preview true and production false, and the map stays three pins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[FLAG], undefined);
  assert.equal(prod.vars[FLAG], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[FLAG], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[FLAG], 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-2), FLAG);
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-2), FLAG);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-2), FLAG);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-1), 'HARIMU_AURELLE_KITE_FESTIVAL_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.length, 70);
  const scene = readFileSync('app/country-scene.tsx', 'utf8');
  assert.match(scene, /citiesForNation\(nationId\)/);
  assert.match(scene, /\{x:50,y:32\},\{x:26,y:76\},\{x:76,y:76\}/);
  assert.doesNotMatch(scene, /brasswell|residentCitiesForNation/);
  assert.match(readFileSync('lib/assembly-rules.ts', 'utf8'), /citiesForNation\('kindle'\)/);
  assert.doesNotMatch(readFileSync('lib/assembly-rules.ts', 'utf8'), /brasswell/);
  assert.match(readFileSync('app/page.tsx', 'utf8'), /bindBrasswellPortEnv/);
  assert.match(readFileSync('tests/flag-off-audit-384.test.mjs', 'utf8'), new RegExp(FLAG));
});

test('flag off: enroll, travel, home and the panel omit the port; flag on: resident city and the port market note', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const offPanel = await r.call('city', 'alice');
  assert.equal(offPanel.data.currentCityId, 'forgehaven');
  assert.equal(JSON.stringify(offPanel.data).includes('brasswell'), false);
  assert.equal('importsNote' in offPanel.data, false);
  assert.equal((await r.call('citizen', 'alice')).data.flags.brasswellPort, undefined);
  r.setFixtureEnv('HARIMU_ENROLL_HOME_CITY_ENABLED', 'true');
  const refused = await r.call('citizen', 'port-off', { action: 'enroll', nationId: 'kindle', expectedNationId: null, cityId: 'brasswell-port' });
  assert.equal(refused.status, 403);
  assert.equal(refused.data.reason, 'not_in_nation');
  assert.equal((await r.call('city', 'alice', { action: 'travel', cityId: 'brasswell-port' })).status, 400);
  r.setFixtureEnv('HARIMU_HOME_CITY_MOVE_ENABLED', 'true');
  assert.equal((await r.call('city-home', 'alice', { cityId: 'brasswell-port', requestId: randomUUID() })).status, 403);

  r.setFixtureEnv(FLAG, 'true');
  assert.equal((await r.call('citizen', 'alice')).data.flags.brasswellPort, true);
  const enrolled = await r.call('citizen', 'port-on', { action: 'enroll', nationId: 'kindle', expectedNationId: null, cityId: 'brasswell-port' });
  assert.equal(enrolled.status, 200, JSON.stringify(enrolled.data));
  r.setFixtureEnv('HARIMU_CITY_IMPORTS_NOTE_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_CITY_SPECIALTY_NOTE_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_CITY_CAPTURE_NOTE_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_CITY_CIVIC_UNIT_NOTE_ENABLED', 'true');
  const home = await r.call('city', 'port-on');
  assert.equal(home.data.homeCityId, 'brasswell-port');
  assert.equal(home.data.currentCityId, 'brasswell-port');
  assert.equal(home.data.importsNote, PORT_NOTE);
  assert.equal(home.data.specialtyRole, 'Port / trade');
  assert.equal(home.data.captureNote, HEARTLAND_CAPTURE_NOTE);
  assert.equal(home.data.civicUnitNote, 'voting district'); // same nation note Emberwell already gets
  const travel = await r.call('city', 'alice', { action: 'travel', cityId: 'brasswell-port' });
  assert.equal(travel.status, 200, JSON.stringify(travel.data));
  assert.equal(travel.data.currentCityId, 'brasswell-port');
  assert.equal(travel.data.importsNote, PORT_NOTE);
  await r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES (?,?,'sell','fixture-cash',-1,5000,1)").bind(randomUUID(), 'alice').run();
  const moved = await r.call('city-home', 'alice', { cityId: 'brasswell-port', requestId: randomUUID() });
  assert.equal(moved.status, 200, JSON.stringify(moved.data));
  assert.equal(moved.data.homeCityId, 'brasswell-port');
  assert.deepEqual(citiesForNation('kindle').map(c => c.id), kindleIds);
});

test('flag on plus sea lanes in winter: freight from Brasswell Port takes the existing port multiplier', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const clock = async season => {
    const epochSec = Math.floor((r.now - (seasonOrder.indexOf(season) * seasonLengthMs + 3_600_000)) / 1000);
    await r.db.prepare("INSERT INTO world_clock (id,epoch_seconds) VALUES ('main',?) ON CONFLICT(id) DO UPDATE SET epoch_seconds=excluded.epoch_seconds").bind(epochSec).run();
  };
  const pay = async user => {
    await r.db.prepare('UPDATE work_shifts SET claimed_at=? WHERE clerk_user_id=? AND claimed_at IS NULL').bind(new Date(r.now).toISOString(), user).run();
    await r.db.prepare('UPDATE citizens SET capacity=100 WHERE clerk_user_id=?').bind(user).run();
    const started = await r.call('citizen', user, { action: 'commit-work', workOrderId: 'freight' });
    assert.equal(started.status, 200, JSON.stringify(started.data));
    return started.data.shifts.find(s => !s.claimedAt).rewardQuantity;
  };
  r.setFixtureEnv(FLAG, 'true');
  r.setFixtureEnv('HARIMU_SEASON_SEA_LANES_ENABLED', 'true');
  await clock('winter');
  const arrived = await r.call('city', 'alice', { action: 'travel', cityId: 'brasswell-port' });
  assert.equal(arrived.data.currentCityId, 'brasswell-port');
  assert.match(arrived.data.seaLanesNote, /^Winter storms: sea freight slowed until spring \(.+ left\)\.$/);
  assert.equal(await pay('alice'), 1, 'winter port freight floor(q*80/100)');
  await clock('summer');
  assert.equal(await pay('alice'), 2, 'summer port freight is unchanged');
  r.setFixtureEnv(FLAG, 'false');
  await clock('winter');
  await r.db.prepare(`INSERT INTO citizen_city_locations(user_id,nation_id,home_city_id,current_city_id,updated_at) VALUES ('bob','kindle','forgehaven','brasswell-port',1)
    ON CONFLICT(user_id) DO UPDATE SET current_city_id='brasswell-port'`).run();
  assert.equal(await pay('bob'), 2, 'flag off: a stored port id is not a port');
});
