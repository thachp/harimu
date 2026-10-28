/** #952: city tier growth. Thresholds, the 7-real-day hold, flag HARIMU_CITY_TIER_GROWTH_ENABLED off (no read, no write, readers still see T1). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { cityTierFor, cityTierName, cityTierStep, CITY_TIER_HOLD_SECONDS } from '../lib/city-tier.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const DAY = 86400;
const read = file => readFileSync(file, 'utf8');
const citySql = `INSERT INTO world_cities (id,nation_id,name,tier,center_x,center_y,authority,founded_by,request_id,founded_at) VALUES (?,?,?,?,?,?,?,?,?,?)`;

test('thresholds at 499/500, 1999/2000, 7999/8000, and the tier names', () => {
  assert.deepEqual([499, 500, 1999, 2000, 7999, 8000].map(cityTierFor), [1, 2, 2, 3, 3, 4]);
  assert.deepEqual([1, 2, 3, 4].map(cityTierName), ['Village', 'Town', 'City', 'Metropolis']);
  assert.equal(CITY_TIER_HOLD_SECONDS, 7 * DAY);
});

test('pure clock: 6 days stays T1, day 7 promotes once, a day-3 drop resets', () => {
  const t0 = 1_700_000_000;
  let s = cityTierStep({ tier: 1, population: 500, aboveSince: null, now: t0 });
  assert.deepEqual(s, { tier: 1, aboveSince: t0 });
  s = cityTierStep({ tier: 1, population: 500, aboveSince: s.aboveSince, now: t0 + 6 * DAY });
  assert.deepEqual(s, { tier: 1, aboveSince: t0 });
  assert.deepEqual(cityTierStep({ tier: 1, population: 499, aboveSince: t0, now: t0 + 3 * DAY }), { tier: 1, aboveSince: null });
  s = cityTierStep({ tier: 1, population: 500, aboveSince: null, now: t0 + 3 * DAY });
  assert.equal(s.aboveSince, t0 + 3 * DAY);
  assert.equal(cityTierStep({ tier: 1, population: 500, aboveSince: s.aboveSince, now: t0 + 9 * DAY }).tier, 1); // day 3 + 6
  s = cityTierStep({ tier: 1, population: 500, aboveSince: s.aboveSince, now: t0 + 10 * DAY }); // day 3 + 7
  assert.equal(s.tier, 2);
  assert.equal(cityTierStep({ tier: s.tier, population: 500, aboveSince: s.aboveSince, now: t0 + 10 * DAY }).tier, 2); // twice the same day
  assert.equal(cityTierStep({ tier: 1, population: 9000, aboveSince: t0, now: t0 + 7 * DAY }).tier, 2); // one tier, not a jump to T4
});

test('migration 0103 widens tier to 1–4 and adds above_next_tier_since (Postgres and SQLite)', async () => {
  const pg = new PGlite(); await pg.waitReady;
  await pg.exec(read('db/postgres/0014_world_cities.sql'));
  await pg.exec(read('db/postgres/0103_city_tier_growth.sql'));
  await pg.exec(read('db/postgres/0103_city_tier_growth.sql')); // idempotent: drop and re-add the check
  await pg.exec(`INSERT INTO world_cities (id,nation_id,name,tier,center_x,center_y,authority,founded_by,request_id,founded_at) VALUES ('c','kindle','Aa',2,1,1,'kindle-charter','a','rq',1)`);
  await assert.rejects(() => pg.exec(`INSERT INTO world_cities (id,nation_id,name,tier,center_x,center_y,authority,founded_by,request_id,founded_at) VALUES ('d','kindle','Bb',5,2,2,'kindle-charter','a','rq2',1)`));
  const col = await pg.query(`SELECT data_type FROM information_schema.columns WHERE table_name='world_cities' AND column_name='above_next_tier_since'`);
  assert.equal(col.rows[0].data_type, 'bigint');
  await pg.close();
  const lite = new DatabaseSync(':memory:');
  lite.exec(read('drizzle/0014_world_cities.sql'));
  lite.exec(read('drizzle/0103_city_tier_growth.sql'));
  lite.prepare(citySql).run('c', 'kindle', 'Aa', 2, 1, 1, 'kindle-charter', 'a', 'rq', 1);
  assert.throws(() => lite.prepare(citySql).run('d', 'kindle', 'Bb', 5, 2, 2, 'kindle-charter', 'a', 'rq2', 1));
  assert.equal(lite.prepare('SELECT above_next_tier_since AS s FROM world_cities').get().s, null);
  lite.close();
  const fresh = new DatabaseSync(':memory:'); fresh.exec(read('lib/city-founding.ts').match(/export const worldCitiesSchema = `([^`]+)`/)[1]);
  fresh.prepare(citySql).run('c', 'kindle', 'Aa', 4, 1, 1, 'kindle-charter', 'a', 'rq', 1);
  assert.equal(fresh.prepare('SELECT above_next_tier_since AS s FROM world_cities').get().s, null);
  fresh.close();
  assert.match(read('lib/db.ts'), /world_cities_tier_old/);
});

async function seedHomes(r, n, cityId) {
  const stmts = [];
  for (let i = 0; i < n; i++) {
    const id = `c952-${i}`;
    stmts.push(r.db.prepare(`INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,'kindle',?,18,0,'Good standing','t','t')`).bind(id, id));
    stmts.push(r.db.prepare(`INSERT INTO citizen_city_locations (user_id,nation_id,home_city_id,current_city_id,updated_at) VALUES (?,'kindle',?,?,1)`).bind(id, cityId, 'forgehaven'));
  }
  // A visitor present in the city whose home is elsewhere is not population.
  stmts.push(r.db.prepare(`INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES ('c952-visit','kindle','visit',18,0,'Good standing','t','t')`));
  stmts.push(r.db.prepare(`INSERT INTO citizen_city_locations (user_id,nation_id,home_city_id,current_city_id,updated_at) VALUES ('c952-visit','kindle','forgehaven',?,1)`).bind(cityId));
  for (let i = 0; i < stmts.length; i += 200) await r.db.batch(stmts.slice(i, i + 200));
}

test('a city above the T2 floor for 6 days stays T1, promotes on day 7, and a day-3 drop resets the clock', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const id = 'city-k';
  await r.db.prepare(citySql).bind(id, 'kindle', 'Newstead', 1, 21, 13, 'kindle-charter', 'alice', 'rq-952', 1).run();
  await seedHomes(r, 500, id);
  const { runCityTierGrowth } = await r.importModule('lib/city-tier.ts');
  const row = async () => { const x = await r.db.prepare('SELECT tier, above_next_tier_since AS since FROM world_cities WHERE id=?').bind(id).first(); return { tier: Number(x.tier), since: x.since == null ? null : Number(x.since) }; };
  const t0 = 1_700_000_000;
  await r.db.prepare(`UPDATE citizen_city_locations SET home_city_id='forgehaven' WHERE user_id='c952-0'`).run(); // 499 homes
  assert.deepEqual(await runCityTierGrowth(r.db, t0, true), { promoted: [], shrunk: [] });
  assert.deepEqual(await row(), { tier: 1, since: null });
  await r.db.prepare(`UPDATE citizen_city_locations SET home_city_id=? WHERE user_id='c952-0'`).bind(id).run();
  await runCityTierGrowth(r.db, t0, true);
  assert.deepEqual(await row(), { tier: 1, since: t0 });
  await runCityTierGrowth(r.db, t0 + 6 * DAY, true);
  assert.deepEqual(await row(), { tier: 1, since: t0 }); // 6 days above the T2 floor stays T1
  await r.db.prepare(`UPDATE citizen_city_locations SET home_city_id='forgehaven' WHERE user_id='c952-0'`).run();
  await runCityTierGrowth(r.db, t0 + 3 * DAY, true);
  assert.deepEqual(await row(), { tier: 1, since: null }); // dropping below on day 3 resets the clock
  await r.db.prepare(`UPDATE citizen_city_locations SET home_city_id=? WHERE user_id='c952-0'`).bind(id).run();
  await runCityTierGrowth(r.db, t0 + 3 * DAY, true);
  assert.deepEqual(await row(), { tier: 1, since: t0 + 3 * DAY });
  await runCityTierGrowth(r.db, t0 + 9 * DAY, true);
  assert.equal((await row()).tier, 1); // 6 days after the reset
  assert.deepEqual(await runCityTierGrowth(r.db, t0 + 10 * DAY, true), { promoted: [id], shrunk: [] });
  assert.equal((await row()).tier, 2);
  assert.deepEqual(await runCityTierGrowth(r.db, t0 + 10 * DAY, true), { promoted: [], shrunk: [] }); // idempotent
  assert.equal((await row()).tier, 2);
});

test('flag off: HARIMU_CITY_TIER_GROWTH_ENABLED does not read or write, and the founding response still reads T1', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  r.setCityFounding(true);
  const cmd = { action: 'kindle-charter', x: 21, y: 13, name: 'Emberford', requestId: 'found-00952a' };
  const off = await r.call('world/found-city', 'alice', cmd);
  assert.equal(off.status, 200, JSON.stringify(off.data));
  assert.equal(off.data.city.tier, 1);
  assert.equal('tierName' in off.data.city, false);
  await r.db.prepare(`UPDATE world_cities SET tier=2, above_next_tier_since=1 WHERE id='city-kindle-21-13'`).run();
  const { runCityTierGrowth } = await r.importModule('lib/city-tier.ts');
  const prepare = r.db.prepare.bind(r.db); let calls = 0;
  r.db.prepare = sql => { calls++; return prepare(sql); };
  assert.deepEqual(await runCityTierGrowth(r.db, 1 + 8 * DAY, false), { promoted: [], shrunk: [] });
  assert.equal(calls, 0, 'flag off opens no statement');
  r.db.prepare = prepare;
  const stored = await r.db.prepare(`SELECT tier, above_next_tier_since AS since FROM world_cities`).first();
  assert.equal(Number(stored.tier), 2); assert.equal(Number(stored.since), 1); // stored row unchanged
  const again = await r.call('world/found-city', 'alice', cmd);
  assert.equal(again.data.replay, true); assert.equal(again.data.city.tier, 1); assert.equal('tierName' in again.data.city, false);
  r.setFixtureEnv('HARIMU_CITY_TIER_GROWTH_ENABLED', 'true');
  const on = await r.call('world/found-city', 'alice', cmd);
  assert.equal(on.data.city.tier, 2); assert.equal(on.data.city.tierName, 'Town');
});
