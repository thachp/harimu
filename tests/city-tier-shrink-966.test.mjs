/** #966: a city short of food or housing for 7 real days drops one tier. Same flag as #952 (HARIMU_CITY_TIER_GROWTH_ENABLED). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { cityTierShrinkStep, runCityTierGrowth, tierStayFloor } from '../lib/city-tier.ts';
import { noticeboardEvents, noticeboardNation } from '../lib/noticeboard.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const DAY = 86400;
const read = file => readFileSync(file, 'utf8');
const t0 = 1_700_000_000;

test('stay floors are the tier entry counts, and 6 days holds while day 7 drops one tier', () => {
  assert.deepEqual([1, 2, 3, 4].map(tierStayFloor), [0, 500, 2000, 8000]);
  const short = { food: 0, housing: 0, floor: 1 };
  let s = cityTierShrinkStep({ tier: 2, belowSince: null, ...short, now: t0 });
  assert.deepEqual(s, { tier: 2, belowSince: t0 });
  s = cityTierShrinkStep({ tier: 2, belowSince: s.belowSince, ...short, now: t0 + 6 * DAY });
  assert.deepEqual(s, { tier: 2, belowSince: t0 }); // 6 days below need stays
  s = cityTierShrinkStep({ tier: 2, belowSince: s.belowSince, ...short, now: t0 + 7 * DAY });
  assert.deepEqual(s, { tier: 1, belowSince: null });
  assert.deepEqual(cityTierShrinkStep({ tier: 1, belowSince: null, ...short, now: t0 + 14 * DAY }), { tier: 1, belowSince: null }); // T1 floor
  s = cityTierShrinkStep({ tier: 4, belowSince: t0, ...short, now: t0 + 7 * DAY });
  assert.equal(s.tier, 3); // one tier, not a jump
  assert.equal(cityTierShrinkStep({ tier: s.tier, belowSince: s.belowSince, ...short, now: t0 + 7 * DAY }).tier, 3); // same window
});

test('food or housing alone is short; both met clears the clock; a capital stops at its starting tier', () => {
  const day7 = t0 + 7 * DAY;
  assert.equal(cityTierShrinkStep({ tier: 2, belowSince: t0, food: 499, housing: 500, floor: 1, now: day7 }).tier, 1);
  assert.equal(cityTierShrinkStep({ tier: 2, belowSince: t0, food: 500, housing: 499, floor: 1, now: day7 }).tier, 1);
  assert.deepEqual(cityTierShrinkStep({ tier: 2, belowSince: t0, food: 500, housing: 500, floor: 1, now: t0 + 3 * DAY }), { tier: 2, belowSince: null });
  assert.deepEqual(cityTierShrinkStep({ tier: 3, belowSince: t0, food: 0, housing: 0, floor: 2, now: day7 }), { tier: 2, belowSince: null });
  assert.deepEqual(cityTierShrinkStep({ tier: 2, belowSince: t0, food: 0, housing: 0, floor: 2, now: day7 }), { tier: 2, belowSince: t0 });
});

test('migration 0107 adds below_need_since and tier_floor (Postgres and SQLite)', async () => {
  const pg = new PGlite(); await pg.waitReady;
  await pg.exec(read('db/postgres/0014_world_cities.sql'));
  await pg.exec(read('db/postgres/0103_city_tier_growth.sql'));
  await pg.exec(`INSERT INTO world_cities (id,nation_id,name,tier,center_x,center_y,authority,founded_by,request_id,founded_at) VALUES ('c','kindle','Aa',1,1,1,'kindle-charter','a','rq',1)`);
  await pg.exec(read('db/postgres/0107_city_tier_shrink.sql'));
  await pg.exec(read('db/postgres/0107_city_tier_shrink.sql'));
  const cols = await pg.query(`SELECT column_name, column_default FROM information_schema.columns WHERE table_name='world_cities' AND column_name IN ('below_need_since','tier_floor') ORDER BY column_name`);
  assert.deepEqual(cols.rows.map(r => r.column_name), ['below_need_since', 'tier_floor']);
  const floor = await pg.query(`SELECT tier_floor FROM world_cities WHERE id='c'`);
  assert.equal(Number(floor.rows[0].tier_floor), 1);
  await pg.close();
  const lite = new DatabaseSync(':memory:');
  lite.exec(read('drizzle/0014_world_cities.sql'));
  lite.exec(read('drizzle/0103_city_tier_growth.sql'));
  lite.exec(read('drizzle/0107_city_tier_shrink.sql'));
  lite.prepare(`INSERT INTO world_cities (id,nation_id,name,tier,center_x,center_y,authority,founded_by,request_id,founded_at) VALUES ('c','kindle','Aa',2,1,1,'kindle-charter','a','rq',1)`).run();
  assert.equal(lite.prepare('SELECT tier_floor AS f, below_need_since AS b FROM world_cities').get().f, 1);
  lite.close();
});

test('no drop at 6 days, drop at 7, T1 floor, capital floor, and the founding read shows the new tier', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  r.setCityFounding(true);
  r.setFixtureEnv('HARIMU_CITY_TIER_GROWTH_ENABLED', 'true');
  const cmd = { action: 'kindle-charter', x: 21, y: 13, name: 'Newstead', requestId: 'found-00966a' };
  const founded = await r.call('world/found-city', 'alice', cmd);
  assert.equal(founded.status, 200, JSON.stringify(founded.data));
  const id = founded.data.city.id;
  await r.db.prepare('UPDATE world_cities SET tier=2 WHERE id=?').bind(id).run();
  const row = async () => { const x = await r.db.prepare('SELECT tier, below_need_since AS below FROM world_cities WHERE id=?').bind(id).first(); return { tier: Number(x.tier), below: x.below == null ? null : Number(x.below) }; };
  assert.deepEqual(await runCityTierGrowth(r.db, t0, true), { promoted: [], shrunk: [] });
  assert.deepEqual(await row(), { tier: 2, below: t0 }); // short of food and housing; clock starts
  await runCityTierGrowth(r.db, t0 + 6 * DAY, true);
  assert.equal((await row()).tier, 2);
  assert.equal((await r.db.prepare(`SELECT COUNT(*) AS n FROM world_events WHERE kind='city-tier-kindle'`).first()).n, 0);
  assert.deepEqual(await runCityTierGrowth(r.db, t0 + 7 * DAY, true), { promoted: [], shrunk: [id] });
  assert.deepEqual(await row(), { tier: 1, below: null });
  assert.deepEqual(await runCityTierGrowth(r.db, t0 + 7 * DAY, true), { promoted: [], shrunk: [] }); // idempotent
  const news = await r.db.prepare(`SELECT kind, headline, detail, location FROM world_events WHERE kind='city-tier-kindle'`).all();
  assert.equal(news.results.length, 1);
  assert.equal(news.results[0].headline, 'Newstead shrinks to a Village');
  assert.match(news.results[0].detail, /short of food and housing/);
  assert.equal(noticeboardNation(news.results[0]), 'kindle');
  assert.deepEqual(noticeboardEvents([{ kind: 'city-tier-korund' }, { kind: 'city-tier-kindle' }], 'korund').map(e => e.kind), ['city-tier-korund']);
  const again = await r.call('world/found-city', 'alice', cmd);
  assert.equal(again.data.replay, true);
  assert.equal(again.data.city.tier, 1);
  assert.equal(again.data.city.tierName, 'Village'); // #955's tier surface shows the drop
  await runCityTierGrowth(r.db, t0 + 21 * DAY, true);
  assert.equal((await row()).tier, 1); // T1 floor
  await r.db.prepare(`UPDATE world_squares SET feature='capital' WHERE x=21 AND y=13`).run();
  await r.db.prepare(`UPDATE world_cities SET tier=3, tier_floor=2, below_need_since=NULL, above_next_tier_since=NULL WHERE id=?`).bind(id).run();
  await runCityTierGrowth(r.db, t0 + 30 * DAY, true);
  assert.equal((await row()).tier, 3); // capital clock starts, no drop yet
  await runCityTierGrowth(r.db, t0 + 37 * DAY, true);
  assert.equal((await row()).tier, 2); // one tier, down to the starting tier
  await runCityTierGrowth(r.db, t0 + 44 * DAY, true);
  assert.equal((await row()).tier, 2); // capital floor holds
});

test('flag off: HARIMU_CITY_TIER_GROWTH_ENABLED does not shrink', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  await r.db.prepare(`INSERT INTO world_cities (id,nation_id,name,tier,center_x,center_y,authority,founded_by,request_id,founded_at,tier_floor) VALUES ('city-966','kindle','Oldstead',3,21,13,'kindle-charter','alice','rq-966',1,1)`).run();
  await r.db.prepare(`UPDATE world_cities SET below_need_since=? WHERE id='city-966'`).bind(t0).run();
  const prepare = r.db.prepare.bind(r.db); let calls = 0;
  r.db.prepare = sql => { calls++; return prepare(sql); };
  assert.deepEqual(await runCityTierGrowth(r.db, t0 + 8 * DAY, false), { promoted: [], shrunk: [] });
  assert.equal(calls, 0, 'flag off opens no statement');
  r.db.prepare = prepare;
  const stored = await r.db.prepare(`SELECT tier, below_need_since AS below FROM world_cities WHERE id='city-966'`).first();
  assert.equal(Number(stored.tier), 3);
  assert.equal(Number(stored.below), t0);
  assert.equal((await r.db.prepare(`SELECT COUNT(*) AS n FROM world_events WHERE kind LIKE 'city-tier-%'`).first()).n, 0);
});
