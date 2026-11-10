/** #1259: Corvel Isles is a Fulmara resident city behind HARIMU_FULMARA_CORVEL_ISLES_ENABLED.
 *  Flag off: residentCitiesForNation, cityForNation, enroll, home, travel and the city panel match today.
 *  "Hosts the Grand Regatta" shows only with HARIMU_FULMARA_GRAND_REGATTA_ENABLED, using the #1178 next date.
 *  citiesForNation('fulmara') stays capital plus two. No country-map pin. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { bindCorvelIslesEnv, citiesForNation, cityCaptureNote, cityForNation, cityHasImports, cityImportsNote, CORVEL_ISLES_FLAG, CORVEL_ISLES_REGATTA_NOTE, HEARTLAND_CAPTURE_NOTE, residentCitiesForNation } from '../lib/cities.ts';
import { FLAG_PACKS } from '../lib/flag-pack.mjs';
import { fulmaraNextGrandRegattaAt } from '../lib/fulmara-grand-regatta.ts';
import { seasonLengthMs, seasonOrder } from '../lib/game-season.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const FLAG = CORVEL_ISLES_FLAG;
const REGATTA = 'HARIMU_FULMARA_GRAND_REGATTA_ENABLED';
const PORT_NOTE = 'Port market: foreign imports arrive here.';
const fulmaraIds = ['arcport', 'vendezzo', 'malvara-rods'];
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1'));
const clear = () => { bindCorvelIslesEnv(undefined); delete process.env[FLAG]; };
const openFulmara = r => {
  r.setFixtureEnv('HARIMU_FULMARA_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_QA_TEST_CITIZENS', 'true');
  r.setFixtureEnv('NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW', 'true');
  r.setFixtureEnv('HARIMU_QA_TEST_CITIZEN_IDS', 'isle-off,isle-on,vale');
};

test('flag off: no resident city; flag on: port resident, imports, heartland; catalog unchanged either way', () => {
  clear();
  assert.deepEqual(citiesForNation('fulmara').map(c => c.id), fulmaraIds);
  assert.deepEqual(residentCitiesForNation('fulmara').map(c => c.id), fulmaraIds);
  assert.equal(cityForNation('fulmara', 'corvel-isles'), undefined);
  process.env[FLAG] = 'true';
  try {
    assert.deepEqual(citiesForNation('fulmara').map(c => c.id), fulmaraIds, 'flag on leaves the capital-plus-two catalog');
    const city = cityForNation('fulmara', 'corvel-isles');
    assert.equal(city?.name, 'Corvel Isles');
    assert.equal(city.nationId, 'fulmara');
    assert.equal(city.role, 'Port / fisheries');
    assert.equal(city.capital, false);
    assert.equal(city.spa, undefined);
    assert.equal(city.description, 'Fair-Wind chapels with votive ship models on the outer islands.');
    assert.equal(cityHasImports(city), true);
    assert.equal(cityImportsNote(city), PORT_NOTE);
    assert.equal(cityCaptureNote('fulmara', 'corvel-isles'), HEARTLAND_CAPTURE_NOTE);
    assert.deepEqual(residentCitiesForNation('fulmara').map(c => c.id), [...fulmaraIds, 'corvel-isles']);
    assert.equal(residentCitiesForNation('kindle').some(c => c.id === 'corvel-isles'), false);
  } finally { clear(); }
  bindCorvelIslesEnv({ HARIMU_GRAY_PACK: { [FLAG]: 'true' }, [FLAG]: 'false' });
  assert.equal(cityForNation('fulmara', 'corvel-isles'), undefined, 'a direct string wins');
  clear();
});

test('the flag is GRAY 74 in HARIMU_GRAY_PACK, preview true and production false, and the map stays three pins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[FLAG], undefined);
  assert.equal(prod.vars[FLAG], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[FLAG], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[FLAG], 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-2), FLAG);
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-2), FLAG);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-2), FLAG);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-5), 'HARIMU_VELDWOOD_RING_MOOT_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.length, 75); // GRAY 75: #1245 Clearing is 72, #1242 Dunmorrow is 73, #1259 Corvel Isles is 74, #1271 Thessaly Wells is last
  const scene = readFileSync('app/country-scene.tsx', 'utf8');
  assert.match(scene, /citiesForNation\(nationId\)/);
  assert.match(scene, /\{x:50,y:32\},\{x:26,y:76\},\{x:76,y:76\}/);
  assert.doesNotMatch(scene, /corvel|residentCitiesForNation/);
  assert.doesNotMatch(readFileSync('lib/assembly-rules.ts', 'utf8'), /corvel/);
  assert.match(readFileSync('app/page.tsx', 'utf8'), /bindCorvelIslesEnv/);
  assert.match(readFileSync('tests/flag-off-audit-384.test.mjs', 'utf8'), new RegExp(FLAG));
});

test('flag off: enroll, travel, home and the panel omit Corvel Isles; flag on: resident city and the port market note; the Grand Regatta line needs both flags', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const offPanel = await r.call('city', 'alice');
  assert.equal(offPanel.data.currentCityId, 'forgehaven');
  assert.equal(JSON.stringify(offPanel.data).includes('corvel'), false);
  assert.equal('grandRegattaNote' in offPanel.data || 'grandRegattaNextAt' in offPanel.data, false);
  assert.equal((await r.call('citizen', 'alice')).data.flags.corvelIsles, undefined);
  openFulmara(r);
  r.setFixtureEnv('HARIMU_ENROLL_HOME_CITY_ENABLED', 'true');
  const vale = await r.call('citizen', 'vale', { action: 'enroll', nationId: 'fulmara', expectedNationId: null });
  assert.equal(vale.status, 200, JSON.stringify(vale.data));
  const refused = await r.call('citizen', 'isle-off', { action: 'enroll', nationId: 'fulmara', expectedNationId: null, cityId: 'corvel-isles' });
  assert.equal(refused.status, 403);
  assert.equal(refused.data.reason, 'not_in_nation');
  assert.equal((await r.call('city', 'vale', { action: 'travel', cityId: 'corvel-isles' })).status, 400);
  r.setFixtureEnv('HARIMU_HOME_CITY_MOVE_ENABLED', 'true');
  assert.equal((await r.call('city-home', 'vale', { cityId: 'corvel-isles', requestId: randomUUID() })).data.reason, 'not_your_nation');

  r.setFixtureEnv(FLAG, 'true');
  assert.equal((await r.call('citizen', 'alice')).data.flags.corvelIsles, true);
  const enrolled = await r.call('citizen', 'isle-on', { action: 'enroll', nationId: 'fulmara', expectedNationId: null, cityId: 'corvel-isles' });
  assert.equal(enrolled.status, 200, JSON.stringify(enrolled.data));
  r.setFixtureEnv('HARIMU_CITY_IMPORTS_NOTE_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_CITY_SPECIALTY_NOTE_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_CITY_CAPTURE_NOTE_ENABLED', 'true');
  const home = await r.call('city', 'isle-on');
  assert.equal(home.data.homeCityId, 'corvel-isles');
  assert.equal(home.data.currentCityId, 'corvel-isles');
  assert.equal(home.data.importsNote, PORT_NOTE);
  assert.equal(home.data.specialtyRole, 'Port / fisheries');
  assert.equal(home.data.captureNote, HEARTLAND_CAPTURE_NOTE);
  assert.equal('grandRegattaNote' in home.data, false, 'Grand Regatta flag off: the line is absent');
  const travel = await r.call('city', 'vale', { action: 'travel', cityId: 'corvel-isles' });
  assert.equal(travel.status, 200, JSON.stringify(travel.data));
  assert.equal(travel.data.currentCityId, 'corvel-isles');
  assert.equal(travel.data.importsNote, PORT_NOTE);
  assert.equal('grandRegattaNote' in travel.data, false);
  const named = await r.call('city-home', 'vale', { cityId: 'corvel-isles', requestId: randomUUID() });
  assert.equal(named.status, 403);
  assert.equal(named.data.reason, 'not_open_yet', 'the city is recognized; Fulmara has no home-move currency, so the existing not_open_yet refusal stands');
  assert.deepEqual(citiesForNation('fulmara').map(c => c.id), fulmaraIds);

  r.setFixtureEnv(REGATTA, 'true');
  const hosted = await r.call('city', 'isle-on');
  const nextAt = fulmaraNextGrandRegattaAt(Math.floor(r.now / 1000) * 1000);
  const government = (await r.call('citizen', 'isle-on')).data.government;
  assert.equal(hosted.data.grandRegattaNote, CORVEL_ISLES_REGATTA_NOTE);
  assert.equal(hosted.data.grandRegattaNextAt, nextAt);
  assert.equal(hosted.data.grandRegattaNextAt, government.grandRegatta.nextAt, 'same next date as the government read');
  assert.equal(government.grandRegatta.hostCity, 'Corvel Isles');
  const capital = await r.call('city', 'vale', { action: 'travel', cityId: 'arcport' });
  assert.equal(capital.data.currentCityId, 'arcport');
  assert.equal('grandRegattaNote' in capital.data, false, 'only Corvel Isles hosts the line');
  r.setFixtureEnv(REGATTA, 'false');
  const hidden = await r.call('city', 'isle-on');
  assert.equal('grandRegattaNote' in hidden.data, false);
  assert.equal((await r.call('citizen', 'isle-on')).data.government?.grandRegatta, undefined, 'Grand Regatta flag off: the government read has no grandRegatta key');
  r.setFixtureEnv(FLAG, 'false');
  assert.equal((await r.call('citizen', 'alice')).data.flags.corvelIsles, undefined);
  assert.equal(JSON.stringify((await r.call('city', 'alice')).data).includes('corvel'), false);
});

test('flag on plus sea lanes in winter: freight from Corvel Isles takes the existing port multiplier', async t => {
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
  await r.db.prepare("UPDATE work_orders SET nation_id='fulmara' WHERE id='freight'").run();
  await r.db.prepare("UPDATE citizens SET nation_id='fulmara' WHERE clerk_user_id='alice'").run();
  r.setFixtureEnv(FLAG, 'true');
  r.setFixtureEnv('HARIMU_SEASON_SEA_LANES_ENABLED', 'true');
  await clock('winter');
  const arrived = await r.call('city', 'alice', { action: 'travel', cityId: 'corvel-isles' });
  assert.equal(arrived.data.currentCityId, 'corvel-isles');
  assert.match(arrived.data.seaLanesNote, /^Winter storms: sea freight slowed until spring \(.+ left\)\.$/);
  assert.equal(await pay('alice'), 1, 'winter port freight floor(q*80/100)');
  await clock('summer');
  assert.equal(await pay('alice'), 2, 'summer port freight is unchanged');
  r.setFixtureEnv(FLAG, 'false');
  await clock('winter');
  await r.db.prepare("UPDATE citizens SET nation_id='fulmara' WHERE clerk_user_id='bob'").run();
  await r.db.prepare(`INSERT INTO citizen_city_locations(user_id,nation_id,home_city_id,current_city_id,updated_at) VALUES ('bob','fulmara','arcport','corvel-isles',1)
    ON CONFLICT(user_id) DO UPDATE SET nation_id='fulmara', current_city_id='corvel-isles'`).run();
  assert.equal(await pay('bob'), 2, 'flag off: a stored port id is not a port');
});

test('CitySummary shows Hosts the Grand Regatta only when the API sends the line', async () => {
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
  const nation = { id: 'fulmara', name: 'Fulmara', capital: 'Arcport', currency: 'Share', government: 'Corporate', economy: 'e', religion: 'r' };
  const destinations = [{ id: 'household', label: 'Household', detail: 'Home' }, { id: 'workplace', label: 'Workplace', detail: 'Work' }];
  const nextAt = fulmaraNextGrandRegattaAt(1_700_000_000_000);
  const base = renderToStaticMarkup(React.createElement(mod.CitySummary, { cityName: 'Corvel Isles', city: { capital: false }, nation, destinations, onView: () => {} }));
  assert.equal(base.includes(CORVEL_ISLES_REGATTA_NOTE), false);
  const shown = renderToStaticMarkup(React.createElement(mod.CitySummary, {
    cityName: 'Corvel Isles', city: { capital: false }, nation, destinations, onView: () => {},
    grandRegattaNote: CORVEL_ISLES_REGATTA_NOTE, grandRegattaNextAt: nextAt,
  }));
  assert.ok(shown.includes(CORVEL_ISLES_REGATTA_NOTE) && shown.includes(new Date(nextAt).toISOString()));
});
