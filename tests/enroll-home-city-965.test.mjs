/** #965: home city at enrollment behind HARIMU_ENROLL_HOME_CITY_ENABLED. Capital when omitted, a catalog city with no #781 cooldown, foreign city refused, flag off unchanged. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { citiesForNation } from '../lib/cities.ts';

const kindle = citiesForNation('kindle'), capital = kindle[0].id;
const tarrek = kindle.find(c => !c.capital).id, third = kindle.filter(c => !c.capital)[1].id;
const foreign = citiesForNation('korund').find(c => !c.capital).id;

async function world(t, { on = true, backend = 'sqlite' } = {}) {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_ENROLL_HOME_CITY_ENABLED', on ? 'true' : undefined);
  const enroll = (user, cityId) => r.call('citizen', user, { action: 'enroll', nationId: 'kindle', expectedNationId: null, ...(cityId === undefined ? {} : { cityId }) });
  const home = async user => (await r.call('city', user)).data;
  const moves = async user => Number((await r.db.prepare('SELECT COUNT(*) AS n FROM home_city_moves WHERE clerk_user_id=?').bind(user).first()).n);
  return { r, enroll, home, moves };
}

for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: omitted or the capital lands on the capital and writes no move`, async t => {
    const { enroll, home, moves } = await world(t, { backend });
    assert.equal((await enroll('nea')).status, 200);
    const loc = await home('nea'); assert.equal(loc.homeCityId, capital); assert.equal(loc.currentCityId, capital); assert.equal(await moves('nea'), 0);
    assert.equal((await enroll('neb', capital)).status, 200);
    assert.equal((await home('neb')).homeCityId, capital); assert.equal(await moves('neb'), 0);
  });

  test(`${backend}: a city in the nation is home, survives the city read, and does not start the move cooldown`, async t => {
    const { r, enroll, home, moves } = await world(t, { backend });
    assert.equal((await enroll('neo', tarrek)).status, 200);
    assert.equal((await home('neo')).homeCityId, tarrek); assert.equal((await home('neo')).currentCityId, tarrek);
    assert.equal((await home('neo')).homeCityId, tarrek, 'a later city read keeps the signup home');
    assert.equal(await moves('neo'), 0);
    assert.equal((await r.call('citizen', 'neo', { action: 'enroll', nationId: 'kindle', expectedNationId: 'kindle', cityId: third })).status, 200);
    assert.equal((await home('neo')).homeCityId, tarrek, 'a repeat enroll is not a free move');
    r.setFixtureEnv('HARIMU_HOME_CITY_MOVE_ENABLED', 'true');
    const info = await r.call('city-home', 'neo'); assert.equal(info.data.nextMoveAt, null);
    await r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES (?,?,'sell','fixture-cash',-1,5000,1)").bind(randomUUID(), 'neo').run();
    const moved = await r.call('city-home', 'neo', { cityId: third, requestId: randomUUID() });
    assert.equal(moved.status, 200, JSON.stringify(moved.data)); assert.equal(moved.data.replayed, false); assert.equal(await moves('neo'), 1);
  });

  test(`${backend}: a city outside the nation is refused and enrollment is not written`, async t => {
    const { r, enroll, moves } = await world(t, { backend });
    for (const cityId of [foreign, 'atlantis', 'ashby-crossing']) {
      const user = `bad-${cityId}`;
      const res = await enroll(user, cityId);
      assert.equal(res.status, 403, cityId); assert.equal(res.data.reason, 'not_in_nation');
      assert.equal(await r.db.prepare('SELECT clerk_user_id FROM citizens WHERE clerk_user_id=?').bind(user).first(), null);
      assert.equal(await moves(user), 0);
    }
  });
}

test('flag off: cityId is ignored, home stays the capital, and the citizen flag is absent', async t => {
  const { r, enroll, home, moves } = await world(t, { on: false });
  assert.equal((await enroll('off', tarrek)).status, 200);
  const loc = await home('off'); assert.equal(loc.homeCityId, capital); assert.equal(loc.currentCityId, capital); assert.equal(await moves('off'), 0);
  assert.equal((await enroll('off2', foreign)).status, 200);
  assert.equal((await home('off2')).homeCityId, capital);
  assert.equal((await r.call('citizen', 'off')).data.flags.enrollHomeCity, undefined);
  r.setFixtureEnv('HARIMU_ENROLL_HOME_CITY_ENABLED', 'true');
  assert.equal((await r.call('citizen', 'off')).data.flags.enrollHomeCity, true);
});

test('the enrollment step lists catalog cities with the capital preselected when the flag is on', async () => {
  const dialog = await readFile(new URL('../app/citizenship-dialog.tsx', import.meta.url), 'utf8');
  assert.match(dialog, /legend>Home city/); assert.match(dialog, /city\.capital \? ' \(capital\)'/);
  const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /homeCities=\{enrollHomeCity \? residentCitiesForNation/);
  assert.match(page, /setEnrollHomeCity\(snapshot\.flags\.enrollHomeCity === true\)/);
});
