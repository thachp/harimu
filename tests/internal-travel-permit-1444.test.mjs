/** #1444: a city visit in a closed system needs the #992 permit. The visit does not consume it. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { localRuntime } from './helpers/local-runtime.mjs';
import { citiesForNation, outpostCityForNation } from '../lib/cities.ts';

const epoch = Date.UTC(2026, 0, 15, 12);
const other = nation => citiesForNation(nation).find(c => !c.capital).id;
const capital = nation => citiesForNation(nation)[0].id;

async function world(t, { permit = true, travel = false, backend = 'sqlite', alert } = {}) {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_INTERNAL_PERMIT_ENABLED', permit ? 'true' : undefined);
  r.setFixtureEnv('HARIMU_HOME_CITY_MOVE_ENABLED', 'true');
  if (travel) r.setTravel(true);
  if (alert) r.setFixtureEnv('HARIMU_VARKAND_ALERT', alert);
  await r.call('citizen', 'alice');
  const nation = id => r.db.prepare('UPDATE citizens SET nation_id=? WHERE clerk_user_id=?').bind(id, 'alice').run();
  const go = cityId => r.call('city', 'alice', { action: 'travel', cityId });
  const ask = cityId => r.call('city-home', 'alice', { action: 'request-permit', cityId, requestId: randomUUID() });
  const here = async () => (await r.db.prepare("SELECT current_city_id FROM citizen_city_locations WHERE user_id='alice'").first())?.current_city_id;
  const consumed = async () => (await r.db.prepare("SELECT consumed_at FROM internal_residence_permits WHERE clerk_user_id='alice' ORDER BY requested_at DESC LIMIT 1").first())?.consumed_at ?? null;
  return { r, nation, go, ask, here, consumed };
}

for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: Korund needs a granted permit; the visit leaves it unconsumed; pending still refuses`, async t => {
    const { r, nation, go, ask, here, consumed } = await world(t, { backend });
    await nation('korund');
    const home = capital('korund'), dest = other('korund');
    const same = await go(home);
    assert.equal(same.status, 200, JSON.stringify(same.data));
    assert.equal(same.data.currentCityId, home);
    assert.equal(await here(), home);
    const blocked = await go(dest);
    assert.equal(blocked.status, 403); assert.equal(blocked.data.error, 'permit_required');
    assert.equal(await here(), home);
    const pending = await ask(dest);
    assert.equal(pending.status, 200, JSON.stringify(pending.data)); assert.equal(pending.data.permit.status, 'pending');
    const still = await go(dest);
    assert.equal(still.status, 403); assert.equal(still.data.error, 'permit_required');
    assert.equal(await here(), home);
    r.setNow(epoch + 60 * 1000);
    const ok = await go(dest);
    assert.equal(ok.status, 200, JSON.stringify(ok.data)); assert.equal(ok.data.currentCityId, dest);
    assert.equal(await consumed(), null, 'a visit does not consume the permit');
    await r.db.prepare("UPDATE citizen_city_locations SET current_city_id=? WHERE user_id='alice'").bind(home).run();
    const again = await go(dest);
    assert.equal(again.status, 200, JSON.stringify(again.data));
    assert.equal(await consumed(), null);
  });

  test(`${backend}: Varkand Green is open; Amber and Red need a permit; Kindle and Aurelle stay open`, async t => {
    const { r, nation, go, ask, here } = await world(t, { backend, alert: 'green' });
    const green = await go(other('kindle'));
    assert.equal(green.status, 200, JSON.stringify(green.data)); assert.notEqual(green.data.error, 'permit_required');
    await nation('aurelle');
    const aurelle = await go(other('aurelle'));
    assert.equal(aurelle.status, 200, JSON.stringify(aurelle.data));
    await nation('meridian');
    const meridian = await go(other('meridian'));
    assert.equal(meridian.status, 403); assert.equal(meridian.data.error, 'permit_required');
    await nation('varkand');
    const open = await go(other('varkand'));
    assert.equal(open.status, 200, JSON.stringify(open.data));
    r.setFixtureEnv('HARIMU_VARKAND_ALERT', 'amber');
    const amber = await go(capital('varkand'));
    assert.equal(amber.status, 403); assert.equal(amber.data.error, 'permit_required');
    assert.equal(await here(), other('varkand'));
    r.setFixtureEnv('HARIMU_VARKAND_ALERT', 'red');
    assert.equal((await go(capital('varkand'))).status, 403);
    r.setNow(epoch + 60 * 1000);
    await ask(capital('varkand'));
    r.setNow(epoch + 120 * 1000);
    const red = await go(capital('varkand'));
    assert.equal(red.status, 200, JSON.stringify(red.data));
    assert.equal((await r.db.prepare("SELECT consumed_at FROM internal_residence_permits WHERE clerk_user_id='alice'").first()).consumed_at, null);
  });

  test(`${backend}: permit flag off leaves Korund instant travel unchanged`, async t => {
    const { nation, go, here } = await world(t, { backend, permit: false });
    await nation('korund');
    const res = await go(other('korund'));
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(await here(), other('korund'));
    assert.equal(res.data.error, undefined);
  });

  test(`${backend}: timed travel uses the same gate, and the current city needs no permit`, async t => {
    const on = await world(t, { backend, travel: true });
    await on.nation('korund');
    const home = capital('korund'), outpost = outpostCityForNation('korund').id;
    const stay = await on.go(home);
    assert.notEqual(stay.data.error, 'permit_required'); assert.equal(stay.data.reason, 'already_here');
    const blocked = await on.go(outpost);
    assert.equal(blocked.status, 403); assert.equal(blocked.data.error, 'permit_required');
    assert.equal(Number((await on.r.db.prepare('SELECT COUNT(*) AS n FROM citizen_travel').first()).n), 0);
    // The outpost is a travel square, not a home-move catalog city, so the grant is the same row requestInternalPermit writes after the 60s wait.
    await on.r.db.prepare('INSERT INTO internal_residence_permits(request_id,clerk_user_id,nation_id,to_city_id,requested_at,consumed_at) VALUES (?,?,?,?,?,NULL)').bind(randomUUID(), 'alice', 'korund', outpost, Math.floor(epoch / 1000) - 60).run();
    const started = await on.go(outpost);
    assert.equal(started.status, 200, JSON.stringify(started.data));
    assert.equal(await on.consumed(), null);
    const off = await world(t, { backend, travel: true, permit: false });
    await off.nation('korund');
    const free = await off.go(outpost);
    assert.equal(free.status, 200, JSON.stringify(free.data)); assert.notEqual(free.data.error, 'permit_required');
  });
}
