/** #1069 (docs §17.4 Away row, §15.4): with HARIMU_DORMANCY_ENABLED on, conscription skips Away (7+ real days idle) as well as Dormant;
 *  flag off keeps the #738 30-day cutoff. Aurelle levy with one citizen per home city, so every eligible citizen is drafted. SQLite + PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

const D = 86400;
async function draft(t, backend, dormancy) {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  await r.call('citizen', 'alice');
  r.setFixtureEnv('HARIMU_ARMIES_ENABLED', 'true'); r.setFixtureEnv('HARIMU_WAR_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_DORMANCY_ENABLED', dormancy ? 'true' : 'false');
  const now = Math.floor(r.now / 1000), iso = s => new Date(s * 1000).toISOString();
  const people = { active6: { idle: 6 }, away8: { idle: 8 }, away29: { idle: 29 }, dormant31: { idle: 31 }, newcomer: { age: 13 } };
  for (const [id, { age = 20, idle = 0 }] of Object.entries(people)) {
    await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at,last_active_at) VALUES (?,?,?,18,0,'Good standing',?,?,?)").bind(id, 'aurelle', id, iso(now - age * D), iso(now), iso(now - idle * D)).run();
    await r.db.prepare('INSERT INTO citizen_city_locations (user_id,nation_id,home_city_id,current_city_id,updated_at) VALUES (?,?,?,?,?)').bind(id, 'aurelle', `city-${id}`, `city-${id}`, now).run();
  }
  const res = await r.call('army/draft', 'active6', { action: 'open' }); assert.equal(res.status, 200);
  return (await r.db.prepare('SELECT clerk_user_id AS id FROM army_conscripts ORDER BY clerk_user_id').all()).results.map(x => x.id);
}

for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: flag on: Away (8, 29 days) and Dormant skipped, active (6 days) drafted, newcomer shield holds`, async t => {
    assert.deepEqual(await draft(t, backend, true), ['active6']);
  });
  test(`${backend}: flag off: old behaviour, Away citizens still drafted, Dormant and newcomers skipped`, async t => {
    assert.deepEqual(await draft(t, backend, false), ['active6', 'away29', 'away8']);
  });
}
