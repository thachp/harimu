/** #1335: a capture diverts the defender's citizens still travelling into the captured city to the city evacuation would pick
 *  (Chebyshev, ties to the capital, then the lower city id), in the same batch. Plus the #1324 loss-cap and nearest-city gaps. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

const D = 86400, DAY1 = Date.UTC(2026, 9, 10, 22, 30);
const ON = { HARIMU_WAR_ENABLED: 'true', HARIMU_WAR_EVACUATION_ENABLED: 'true' };
const iso = sec => new Date(sec * 1000).toISOString();

async function setup(t, options = {}) {
  const r = await localRuntime(); t.after(() => r.close()); r.setNow(DAY1);
  const siege = await r.importModule('lib/siege-actions.ts');
  const nowS = () => Math.floor(r.now / 1000), run = (sql, ...b) => r.db.prepare(sql).bind(...b).run(), one = (sql, ...b) => r.db.prepare(sql).bind(...b).first();
  await run('INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,declared_by,declared_at,mobilization_ends_at) VALUES (?,?,?,?,?,?,?,?)', 'w1', 'rq-w1', 'pair-w1', 'korund', 'kindle', 'test', nowS() - 5 * D, nowS() - 3 * D);
  const assault = (over, at, env = ON) => { if (at !== undefined) r.setNow(at); return siege.resolveCityAssault(r.db, { nation: 'korund', warId: 'w1', cityKind: 'outpost', cityId: 'kindle', ...over }, nowS(), true, { env, lossCap: options.lossCap === true }); };
  const person = async (id, nation, travel, loc) => {
    const now = nowS();
    await run('INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at,last_active_at) VALUES (?,?,?,18,1,\'Good standing\',?,?,?)', id, nation, id, iso(now), iso(now), iso(now));
    const [fx, fy, tx, ty, until] = travel;
    await run('INSERT INTO citizen_travel (user_id,nation_id,from_x,from_y,to_x,to_y,departed_at,traveling_until,request_id) VALUES (?,?,?,?,?,?,?,?,?)', id, nation, fx, fy, tx, ty, Math.min(1, until), until, `tr-${id}`);
    if (loc) await run('INSERT INTO citizen_city_locations (user_id,nation_id,home_city_id,current_city_id,updated_at) VALUES (?,?,?,?,?)', id, nation, loc, loc, now);
  };
  const spot = async id => { const row = await one('SELECT t.to_x AS x, t.to_y AS y, t.traveling_until AS until, l.home_city_id AS home FROM citizen_travel t LEFT JOIN citizen_city_locations l ON l.user_id=t.user_id WHERE t.user_id=?', id); return { x: Number(row.x), y: Number(row.y), until: Number(row.until), home: row.home }; };
  const evacuated = async id => !!(await one('SELECT user_id FROM citizen_evacuations WHERE user_id=?', id));
  return { r, run, one, assault, nowS, person, spot, evacuated };
}
const found = (c, id, x, y, name) => c.run(`INSERT INTO world_cities (id,nation_id,name,tier,center_x,center_y,authority,founded_by,request_id,founded_at) VALUES (?,?,?,1,?,?,'kindle-charter','alice',?,1)`, id, 'kindle', name, x, y, `rq-${id}`);

test('nearest city: Chebyshev, not Manhattan; equal distance goes to the capital, then the lower city id', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const { nearest } = await r.importModule('lib/war-evacuation.ts');
  const place = (cityId, x, y) => ({ x, y, cityId, label: cityId });
  const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y), o = { x: 0, y: 0 };
  const diag = place('diag', 3, 3), line = place('line', 4, 0); // Chebyshev 3 vs 4; Manhattan 6 vs 4
  assert.ok(manhattan(o, line) < manhattan(o, diag), 'Manhattan would pick the other city');
  assert.equal(nearest(o, [line, diag], null).cityId, 'diag');
  assert.equal(nearest(o, [place('aa-town', 1, 2), place('zz-capital', 2, 1)], 'zz-capital').cityId, 'zz-capital', 'tie: the capital wins over a lower id');
  assert.equal(nearest(o, [place('b-town', 2, 0), place('a-town', 0, 2), place('cap', 9, 9)], 'cap').cityId, 'a-town', 'tie, neither capital: lower id');
  assert.equal(nearest(o, [place('b-town', 2, 0), place('a-town', 0, 2)], null).cityId, 'a-town', 'tie, no capital: lower id');
  assert.equal(nearest(o, [], 'cap'), null);
});

test('capture diverts citizens travelling into the captured city to the city evacuation picks; nobody else; a replay changes nothing', async t => {
  const c = await setup(t), now = c.nowS(), far = now + 10 * D;
  await found(c, 'eastmark', 12, 7, 'Eastmark'); // from the outpost (8,7): Chebyshev 4 / Manhattan 4; the capital (5,4) is Chebyshev 3 / Manhattan 6
  await c.person('inbound', 'kindle', [5, 4, 8, 7, far]);
  await c.person('homed', 'kindle', [5, 4, 8, 7, far], 'eastmark');
  await c.person('elsewhere', 'kindle', [8, 7, 2, 2, far]);
  await c.person('kor', 'korund', [15, 7, 8, 7, far]);
  await c.assault({ requestId: 'req-day-one' });
  const taken = await c.assault({ requestId: 'req-capture' }, DAY1 + D * 1000);
  assert.equal(taken.ok, true, JSON.stringify(taken)); assert.ok(taken.captured.moved >= 1);
  const at = c.nowS();
  assert.deepEqual(await c.spot('inbound'), { x: 5, y: 4, until: at, home: null }, 'Chebyshev: the capital, not Eastmark; arrives now, not at the outpost');
  assert.deepEqual(await c.spot('homed'), { x: 12, y: 7, until: at, home: 'eastmark' }, 'a safe home with a square is where they go; home unchanged');
  assert.equal(await c.evacuated('inbound'), true);
  assert.deepEqual(await c.spot('elsewhere'), { x: 2, y: 2, until: far, home: null }, 'travel to another city is untouched');
  assert.deepEqual(await c.spot('kor'), { x: 8, y: 7, until: far, home: null }, 'other nations are not diverted');
  assert.equal(await c.evacuated('kor'), false);
  assert.equal(Number((await c.one('SELECT COUNT(*) AS n FROM home_city_moves')).n), 0);
  const marked = await c.one('SELECT evacuated_at AS at FROM citizen_evacuations WHERE user_id=\'inbound\'');
  c.r.setNow(DAY1 + 3 * D * 1000);
  const replay = await c.assault({ requestId: 'req-capture' });
  assert.equal(replay.replay, true);
  assert.deepEqual(await c.spot('inbound'), { x: 5, y: 4, until: at, home: null }, 'a replay does not move them again');
  assert.deepEqual(await c.one('SELECT evacuated_at AS at FROM citizen_evacuations WHERE user_id=\'inbound\''), marked);
});

test('flag off: capture leaves travel alone and the traveller still arrives in the captured city', async t => {
  const c = await setup(t), far = c.nowS() + 10 * D, OFF = { HARIMU_WAR_ENABLED: 'true', HARIMU_WAR_EVACUATION_ENABLED: 'false' };
  await c.person('inbound', 'kindle', [5, 4, 8, 7, far]);
  await c.assault({ requestId: 'req-day-one' }, undefined, OFF);
  const taken = await c.assault({ requestId: 'req-capture' }, DAY1 + D * 1000, OFF);
  assert.equal(taken.ok, true, JSON.stringify(taken));
  assert.deepEqual(await c.spot('inbound'), { x: 8, y: 7, until: far, home: null });
  assert.equal(await c.evacuated('inbound'), false);
});

test('loss cap on: a partial capture moves nobody; the capture that flips the city evacuates and diverts', async t => {
  const c = await setup(t, { lossCap: true }), far = c.nowS() + 40 * D;
  await c.run("UPDATE world_squares SET zone='frontier', owner=NULL, feature=NULL WHERE x BETWEEN 10 AND 14 AND y BETWEEN 7 AND 11");
  await c.run("UPDATE world_squares SET feature='city' WHERE x=12 AND y=9");
  const spots = (await c.r.db.prepare('SELECT x,y FROM world_squares WHERE x BETWEEN 10 AND 14 AND y BETWEEN 7 AND 11 ORDER BY y,x').all()).results;
  for (const s of spots.slice(0, 5)) await c.run("UPDATE world_squares SET owner='kindle' WHERE x=? AND y=?", s.x, s.y);
  await c.run("UPDATE world_squares SET owner='korund', zone='frontier' WHERE x=? AND y=?", spots[0].x - 1, spots[0].y);
  await found(c, 'city-f1', 12, 9, 'Newtown');
  await c.run("UPDATE world_squares SET owner=NULL WHERE owner='kindle' AND NOT (x BETWEEN 10 AND 14 AND y BETWEEN 7 AND 11)");
  const pad = (await c.r.db.prepare("SELECT x,y FROM world_squares WHERE owner IS NULL AND NOT (x BETWEEN 10 AND 14 AND y BETWEEN 7 AND 11) ORDER BY y,x").all()).results;
  for (const s of pad.slice(0, 20)) await c.run("UPDATE world_squares SET owner='kindle', zone='frontier' WHERE x=? AND y=?", s.x, s.y); // 25 held: limit 2 a week
  await c.person('resident', 'kindle', [12, 9, 12, 9, 1]);
  await c.person('inbound', 'kindle', [5, 4, 12, 9, far]);
  const hit = (n, day) => c.assault({ cityKind: 'founded', cityId: 'city-f1', requestId: `req-assault-${n}` }, DAY1 + day * D * 1000);
  assert.equal((await hit(1, 0)).ok, true);
  const partial = await hit(2, 1);
  assert.equal(partial.ok, true, JSON.stringify(partial)); assert.equal(partial.captured.partial, true);
  assert.deepEqual(await c.spot('resident'), { x: 12, y: 9, until: 1, home: null }, 'partial: no evacuation');
  assert.deepEqual(await c.spot('inbound'), { x: 12, y: 9, until: far, home: null }, 'partial: no divert');
  assert.equal(Number((await c.one('SELECT COUNT(*) AS n FROM citizen_evacuations')).n), 0);
  assert.equal((await hit(3, 8)).captured.partial, true);
  const flip = await hit(4, 15);
  assert.equal(flip.ok, true, JSON.stringify(flip)); assert.equal(flip.captured.partial, false);
  const at = c.nowS();
  assert.deepEqual(await c.spot('resident'), { x: 5, y: 4, until: at, home: null }, 'flip: evacuated to the capital');
  assert.deepEqual(await c.spot('inbound'), { x: 5, y: 4, until: at, home: null }, 'flip: diverted to the capital');
});
