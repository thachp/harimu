/** #1448: POST /api/travel start-travel uses the #1444 permit. A visit does not consume it.
 *  Map travel supports Kindle, Korund and Aurelle only, so Varkand Green/Red is the city visit that can finish. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { localRuntime } from './helpers/local-runtime.mjs';
import { citiesForNation, outpostCityForNation } from '../lib/cities.ts';

const epoch = Date.UTC(2026, 0, 15, 12);
const capital = nation => citiesForNation(nation)[0].id;
const others = nation => citiesForNation(nation).filter(c => !c.capital).map(c => c.id);
const KREL = { x: 15, y: 7 };

async function world(t, { permit = true, travel = true, backend = 'sqlite', alert } = {}) {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_INTERNAL_PERMIT_ENABLED', permit ? 'true' : undefined);
  if (alert) r.setFixtureEnv('HARIMU_VARKAND_ALERT', alert);
  r.setTravel(travel);
  const nation = (id, user = 'alice') => r.db.prepare('UPDATE citizens SET nation_id=? WHERE clerk_user_id=?').bind(id, user).run();
  const go = (x, y, user = 'alice') => r.call('travel', user, { action: 'start-travel', x, y, requestId: randomUUID() });
  const visit = (cityId, user = 'alice') => r.call('city', user, { action: 'travel', cityId });
  const grant = (user, cityId, nationId) => r.db.prepare('INSERT INTO internal_residence_permits(request_id,clerk_user_id,nation_id,to_city_id,requested_at,consumed_at) VALUES (?,?,?,?,?,NULL)').bind(randomUUID(), user, nationId, cityId, Math.floor(epoch / 1000) - 60).run();
  const journeys = async () => Number((await r.db.prepare('SELECT COUNT(*) AS n FROM citizen_travel').first()).n);
  const cityOf = async (user = 'alice') => (await r.db.prepare('SELECT current_city_id FROM citizen_city_locations WHERE user_id=?').bind(user).first())?.current_city_id ?? null;
  const consumed = async (user = 'alice') => (await r.db.prepare('SELECT consumed_at FROM internal_residence_permits WHERE clerk_user_id=? ORDER BY requested_at DESC LIMIT 1').bind(user).first())?.consumed_at ?? null;
  return { r, nation, go, visit, grant, journeys, cityOf, consumed };
}

for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: Korund start-travel to Krel Arsenal needs a grant and does not consume it`, async t => {
    const on = await world(t, { backend });
    await on.nation('korund');
    const blocked = await on.go(KREL.x, KREL.y);
    assert.equal(blocked.status, 403, JSON.stringify(blocked.data));
    assert.equal(blocked.data.error, 'permit_required');
    assert.equal(blocked.data.reason, 'permit_required');
    assert.equal(await on.journeys(), 0);
    await on.grant('alice', outpostCityForNation('korund').id, 'korund');
    const started = await on.go(KREL.x, KREL.y);
    assert.equal(started.status, 200, JSON.stringify(started.data));
    assert.equal(started.data.state.traveling.to.cityId, 'krel-arsenal');
    assert.equal(await on.consumed(), null);
    assert.equal(await on.cityOf(), capital('korund'), 'map travel does not move the current city');
    const off = await world(t, { backend, permit: false });
    await off.nation('korund');
    const free = await off.go(KREL.x, KREL.y);
    assert.equal(free.status, 200, JSON.stringify(free.data));
    assert.notEqual(free.data.error, 'permit_required');
  });

  test(`${backend}: Kindle, Aurelle and a non-city square stay open`, async t => {
    const { r, nation, go } = await world(t, { backend });
    const kindle = await go(8, 7);
    assert.equal(kindle.status, 200, JSON.stringify(kindle.data));
    assert.equal(kindle.data.state.traveling.to.cityId, 'ashby-crossing');
    r.setNow(epoch + 900 * 1000);
    await nation('aurelle');
    const aurelle = await go(12, 11);
    assert.equal(aurelle.status, 200, JSON.stringify(aurelle.data));
    assert.equal(aurelle.data.state.traveling.to.cityId, 'vale-bridge');
    r.setNow(epoch + 1800 * 1000);
    await nation('korund');
    const square = await go(18, 5);
    assert.equal(square.status, 200, JSON.stringify(square.data));
    assert.equal(square.data.state.traveling.to.cityId, null);
  });

  test(`${backend}: Varkand Green city visit is allowed and Red is refused`, async t => {
    const { r, nation, visit, cityOf } = await world(t, { backend, travel: false, alert: 'green' });
    await nation('varkand');
    const open = await visit(others('varkand')[0]);
    assert.equal(open.status, 200, JSON.stringify(open.data));
    assert.equal(await cityOf(), others('varkand')[0]);
    r.setFixtureEnv('HARIMU_VARKAND_ALERT', 'red');
    const red = await visit(capital('varkand'));
    assert.equal(red.status, 403, JSON.stringify(red.data));
    assert.equal(red.data.error, 'permit_required');
    assert.equal(await cityOf(), others('varkand')[0]);
  });

  test(`${backend}: a wrong-city grant and another citizen's grant still refuse both routes`, async t => {
    const map = await world(t, { backend });
    await map.nation('korund');
    await map.nation('korund', 'bob');
    const outpost = outpostCityForNation('korund').id;
    await map.grant('alice', capital('korund'), 'korund');
    const wrongMap = await map.go(KREL.x, KREL.y);
    assert.equal(wrongMap.status, 403, JSON.stringify(wrongMap.data));
    assert.equal(wrongMap.data.error, 'permit_required');
    assert.equal(await map.journeys(), 0);
    const stranger = await world(t, { backend });
    await stranger.nation('korund');
    await stranger.grant('bob', outpost, 'korund');
    const otherMap = await stranger.go(KREL.x, KREL.y);
    assert.equal(otherMap.status, 403, JSON.stringify(otherMap.data));
    assert.equal(otherMap.data.error, 'permit_required');
    assert.equal(await stranger.journeys(), 0);
    assert.equal(await stranger.consumed('bob'), null);

    const city = await world(t, { backend, travel: false });
    await city.nation('korund');
    const [dest, wrong] = others('korund');
    await city.grant('alice', wrong, 'korund');
    const wrongCity = await city.visit(dest);
    assert.equal(wrongCity.status, 403, JSON.stringify(wrongCity.data));
    assert.equal(wrongCity.data.error, 'permit_required');
    assert.equal(await city.cityOf(), capital('korund'));
    const cityOther = await world(t, { backend, travel: false });
    await cityOther.nation('korund');
    await cityOther.grant('bob', dest, 'korund');
    const otherCity = await cityOther.visit(dest);
    assert.equal(otherCity.status, 403, JSON.stringify(otherCity.data));
    assert.equal(otherCity.data.error, 'permit_required');
    assert.equal(await cityOther.cityOf(), capital('korund'));
    assert.equal(await cityOther.consumed('bob'), null);
  });
}
