/** #419 slice B: resolving a successful city assault (server-only, behind HARIMU_WAR_ENABLED). Capture takes two assaults on two UTC days inside the defender's window. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';

const D = 86400, SECRET = 'a-very-long-server-only-secret', bearer = `Bearer ${SECRET}`;
const DAY1 = Date.UTC(2026, 9, 10, 22, 30), tables = ['city_sieges', 'siege_assaults', 'city_captures', 'city_capture_squares'];
async function setup(t, backend) {
  const r = await localRuntime(backend ? { backend } : {}); t.after(() => r.close());
  r.setNow(DAY1);
  const siege = await r.importModule('lib/siege-actions.ts'), actions = await r.importModule('lib/war-actions.ts'), nowS = () => Math.floor(r.now / 1000);
  const run = (sql, ...b) => r.db.prepare(sql).bind(...b).run(), one = (sql, ...b) => r.db.prepare(sql).bind(...b).first(), all = async (sql, ...b) => (await r.db.prepare(sql).bind(...b).all()).results.map(x => ({ ...x }));
  const war = async (id = 'w1', over = {}) => { const declared = over.declared ?? nowS() - 5 * D; await run('INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,declared_by,declared_at,mobilization_ends_at,ended_at,end_kind) VALUES (?,?,?,?,?,?,?,?,?,?)', id, `rq-${id}`, over.pair ?? `pair-${id}`, over.attacker ?? 'korund', over.defender ?? 'kindle', 'test', declared, declared + 172800, over.endedAt ?? null, over.endedAt ? 'other' : null); };
  let n = 0;
  const assault = (over = {}, at) => { if (at !== undefined) r.setNow(at); return siege.resolveCityAssault(r.db, { nation: 'korund', warId: 'w1', cityKind: 'outpost', cityId: 'kindle', requestId: `req-assault-${++n}`, ...over }, nowS(), true); };
  const counts = async () => Object.fromEntries(await Promise.all(tables.map(async x => [x, (await one(`SELECT COUNT(*) AS n FROM ${x}`)).n])));
  const owners = async () => JSON.stringify(await all('SELECT x,y,owner FROM world_squares ORDER BY y,x'));
  return { r, siege, actions, run, one, all, war, assault, counts, owners, nowS };
}
const outpost = async c => { const m = await c.r.importModule('lib/map-zones.ts'); return m.mvpNations.find(x => x.id === 'kindle').outpost; };
async function foundedCity(c) {
  await c.run("UPDATE world_squares SET zone='frontier', owner='kindle', feature=NULL WHERE x BETWEEN 10 AND 14 AND y BETWEEN 7 AND 11");
  await c.run("UPDATE world_squares SET feature='city' WHERE x=12 AND y=9");
  await c.run("UPDATE world_squares SET owner=NULL WHERE x=10 AND y=7");
  await c.run("INSERT INTO world_cities (id,nation_id,name,tier,center_x,center_y,authority,founded_by,request_id,founded_at) VALUES ('city-f1','kindle','Newtown',1,12,9,'kindle-charter','alice','rq-city-f1',1)");
  await c.run("INSERT INTO world_square_purchases (request_id,clerk_user_id,nation_id,x,y,price_minor,purchased_at) VALUES ('sq-b1','alice','kindle',11,8,2500,1)");
}
const fail = (res, status, reason) => { assert.equal(res.ok, false, JSON.stringify(res)); assert.deepEqual([res.status, res.reason], [status, reason], res.error); };

for (const backend of ['sqlite', 'postgres']) {
  test(`an outpost falls to two successful assaults on two UTC days, and only then (${backend})`, async t => {
    const c = await setup(t, backend); await c.war(); const o = await outpost(c);
    const first = await c.assault();
    assert.equal(first.ok, true, JSON.stringify(first)); assert.deepEqual([first.siege.days, first.siege.capturedAt, first.captured], [1, null, undefined]);
    assert.equal((await c.one('SELECT owner FROM world_squares WHERE x=? AND y=?', o.x, o.y)).owner, 'kindle', 'one assault moves nothing');
    fail(await c.assault({}, DAY1 + 3600 * 1000), 409, 'already_assaulted_today');
    assert.equal((await c.counts()).siege_assaults, 1, 'a second success the same UTC day does not count');
    const second = await c.assault({ requestId: 'req-capture-1' }, DAY1 + D * 1000);
    assert.equal(second.ok, true, JSON.stringify(second)); assert.deepEqual(second.captured, { moved: 1, keptPrivate: 0 }); assert.equal(second.siege.capturedAt, Math.floor((DAY1 + D * 1000) / 1000));
    assert.equal((await c.one('SELECT owner FROM world_squares WHERE x=? AND y=?', o.x, o.y)).owner, 'korund');
    assert.deepEqual(await c.counts(), { city_sieges: 1, siege_assaults: 2, city_captures: 1, city_capture_squares: 1 });
    const cap = await c.one('SELECT attacker_nation,defender_nation,squares_transferred,squares_kept_private FROM city_captures'); assert.deepEqual({ ...cap }, { attacker_nation: 'korund', defender_nation: 'kindle', squares_transferred: 1, squares_kept_private: 0 });
    const before = await c.owners();
    fail(await c.assault({}, DAY1 + 2 * D * 1000), 409, 'already_captured'); assert.equal(await c.owners(), before);
    assert.deepEqual(await c.all('SELECT request_id FROM siege_assaults WHERE assault_day NOT BETWEEN assaulted_at / 86400 - 1 AND assaulted_at / 86400'), [], 'every assault_day is the UTC day of its assaulted_at, or the day before for the tail of a window that began the day before (#577)');
    assert.deepEqual(await c.all('SELECT c.id FROM city_captures c JOIN city_sieges s ON s.id=c.siege_id WHERE c.war_id <> s.war_id OR c.attacker_nation <> s.attacker_nation OR c.defender_nation <> s.defender_nation'), [], 'a capture carries its siege war and sides');
    const replay = await c.assault({ requestId: 'req-capture-1' }); assert.equal(replay.replay, true); assert.equal((await c.counts()).city_captures, 1);
  });

  test(`a captured founded city moves national control only: purchased squares keep owner and purchase row (${backend})`, async t => {
    const c = await setup(t, backend); await c.war(); await foundedCity(c);
    const cmd = { cityKind: 'founded', cityId: 'city-f1' };
    assert.equal((await c.assault(cmd)).ok, true);
    const done = await c.assault({ ...cmd, requestId: 'req-capture-2' }, DAY1 + D * 1000);
    assert.deepEqual(done.captured, { moved: 23, keptPrivate: 1 });
    const own = async (x, y) => (await c.one('SELECT owner FROM world_squares WHERE x=? AND y=?', x, y)).owner;
    assert.equal(await own(11, 8), 'kindle', 'purchased square keeps its owner'); assert.equal((await c.one("SELECT COUNT(*) AS n FROM world_square_purchases WHERE x=11 AND y=8")).n, 1);
    assert.equal(await own(10, 7), null, 'a square the defender did not hold is untouched');
    assert.equal(await own(12, 9), 'korund'); assert.equal(await own(14, 11), 'korund'); assert.equal(await own(9, 9), null);
    assert.equal((await c.one("SELECT nation_id FROM world_cities WHERE id='city-f1'")).nation_id, 'korund');
    assert.equal((await c.one('SELECT COUNT(*) AS n FROM world_squares WHERE owner=? AND x BETWEEN 10 AND 14 AND y BETWEEN 7 AND 11', 'korund')).n, 23);
    assert.equal((await c.counts()).city_capture_squares, 23);
    assert.equal((await c.one("SELECT COUNT(*) AS n FROM city_capture_squares WHERE x=11 AND y=8")).n, 0);
  });
}

test('refusals fail closed, in order, and write nothing', async t => {
  const c = await setup(t); await c.war(); await c.war('w-mob', { declared: c.nowS() - D }); await c.war('w-end', { endedAt: c.nowS() - 100 });
  const start = await c.counts(), map = await c.owners();
  fail(await c.assault({ nation: 'kindle' }), 409, 'wrong_side');
  fail(await c.assault({ nation: 'aurelle' }), 409, 'wrong_side');
  fail(await c.assault({ warId: 'w-mob' }), 409, 'war_not_active');
  fail(await c.assault({ warId: 'w-end' }), 409, 'war_not_active');
  fail(await c.assault({ warId: 'nope' }), 409, 'not_found');
  fail(await c.assault({ cityId: 'korund' }), 409, 'not_defenders_city');
  fail(await c.assault({ cityId: 'nowhere' }), 409, 'not_a_city');
  fail(await c.assault({ cityKind: 'founded', cityId: 'missing' }), 409, 'not_a_city');
  fail(await c.assault({ cityKind: 'capital' }), 400, 'bad_request'); fail(await c.assault({ requestId: 'x' }), 400, 'bad_request'); fail(await c.assault({ nation: 'atlantis' }), 400, 'bad_request');
  fail(await c.assault({ cityKind: 'founded', cityId: 'c'.repeat(73) }), 409, 'city_id_too_long');
  fail(await c.siege.resolveCityAssault(c.r.db, { nation: 'korund', warId: 'w1', cityKind: 'outpost', cityId: 'kindle', requestId: 'req-ms-1' }, c.r.now, true), 400, 'bad_request'); // milliseconds, not seconds
  fail(await c.siege.resolveCityAssault(c.r.db, { nation: 'korund', warId: 'w1', cityKind: 'outpost', cityId: 'kindle', requestId: 'req-nan-1' }, NaN, true), 400, 'bad_request');
  fail(await c.assault({}, Date.UTC(2026, 9, 10, 12, 0)), 409, 'outside_window');
  fail(await c.assault({}, Date.UTC(2026, 9, 11, 2, 30)), 409, 'outside_window');
  // Heartland and a Frontier city that is really a capital square can never be besieged.
  await c.run("UPDATE world_squares SET zone='heartland', owner='kindle', feature='city' WHERE x=12 AND y=9");
  await c.run("INSERT INTO world_cities (id,nation_id,name,tier,center_x,center_y,authority,founded_by,request_id,founded_at) VALUES ('city-h','kindle','Inner',1,12,9,'kindle-charter','alice','rq-city-h',1)");
  fail(await c.assault({ cityKind: 'founded', cityId: 'city-h' }, DAY1), 409, 'heartland');
  await c.run("UPDATE world_squares SET zone='frontier', feature='capital' WHERE x=12 AND y=9");
  fail(await c.assault({ cityKind: 'founded', cityId: 'city-h' }), 409, 'capital');
  const cap = (await (await c.r.importModule('lib/map-zones.ts')).mvpNations.find(x => x.id === 'kindle').capital);
  await c.run("INSERT INTO world_cities (id,nation_id,name,tier,center_x,center_y,authority,founded_by,request_id,founded_at) VALUES ('city-cap','kindle','Cap',1,?,?,'kindle-charter','alice','rq-city-cap',1)", cap.x, cap.y);
  fail(await c.assault({ cityKind: 'founded', cityId: 'city-cap' }), 409, 'capital');
  assert.deepEqual(await c.counts(), start, 'no refusal wrote a siege or an assault');
  assert.notEqual(await c.owners(), map); // only the test's own setup edits above changed the map
});

test('the command is server-only: flag off is 403, no credential is 401, and neither writes', async t => {
  const c = await setup(t); await c.war(); const start = await c.counts(), map = await c.owners();
  const body = { action: 'assault', nation: 'korund', warId: 'w1', cityKind: 'outpost', cityId: 'kindle', requestId: 'req-server-1' };
  const via = (over = {}) => c.actions.handleWarCommand(c.r.db, { enabled: true, secret: SECRET, authorization: bearer, body, now: c.nowS(), ...over });
  fail(await c.siege.resolveCityAssault(c.r.db, { nation: 'korund', warId: 'w1', cityKind: 'outpost', cityId: 'kindle', requestId: 'req-server-0' }, c.nowS(), false), 403, 'disabled');
  fail(await via({ enabled: false }), 403, 'disabled'); fail(await via({ authorization: null }), 401, 'unauthorized'); fail(await via({ authorization: 'Bearer wrong-secret-wrong-secret' }), 401, 'unauthorized');
  assert.deepEqual(await c.counts(), start); assert.equal(await c.owners(), map);
  const ok = await via(); assert.equal(ok.ok, true, JSON.stringify(ok)); assert.equal(ok.siege.days, 1);
  const replay = await via(); assert.equal(replay.replay, true); assert.equal((await c.counts()).siege_assaults, 1);
  fail(await via({ body: { ...body, requestId: 'req-server-2', cityId: 'korund' } }), 409, 'not_defenders_city');
  fail(await c.actions.handleWarCommand(c.r.db, { enabled: true, secret: SECRET, authorization: bearer, body: { ...body, requestId: 'req-server-3', action: 'invade' }, now: c.nowS() }), 400, 'bad_request');
  const route = await readFile(new URL('../app/api/war/route.ts', import.meta.url), 'utf8'); assert.doesNotMatch(route, /export async function (GET|PUT|PATCH|DELETE)/);
});

test('a retry reusing a request id for another command is refused; a crash between the second assault and the capture is repaired by the retry', async t => {
  const c = await setup(t); await c.war();
  assert.equal((await c.assault({ requestId: 'req-keep-1' })).ok, true);
  fail(await c.assault({ requestId: 'req-keep-1', cityId: 'kindle', nation: 'kindle' }, DAY1), 409, 'request_reused');
  const o = await outpost(c);
  // Simulate the crash: the second day's assault row exists, the capture does not.
  const sid = (await c.one('SELECT id FROM city_sieges')).id;
  await c.run('INSERT INTO siege_assaults (request_id,siege_id,assault_day,assaulted_at) VALUES (?,?,?,?)', 'req-crash-1', sid, Math.floor((DAY1 + D * 1000) / 1000 / 86400), Math.floor((DAY1 + D * 1000) / 1000));
  assert.equal((await c.one('SELECT owner FROM world_squares WHERE x=? AND y=?', o.x, o.y)).owner, 'kindle');
  const fixed = await c.assault({ requestId: 'req-crash-1' }, DAY1 + (D + 60) * 1000);
  assert.equal(fixed.replay, true); assert.deepEqual(fixed.captured, { moved: 1, keptPrivate: 0 });
  assert.equal((await c.one('SELECT owner FROM world_squares WHERE x=? AND y=?', o.x, o.y)).owner, 'korund');
  await c.assault({ requestId: 'req-crash-1' }); assert.deepEqual(await c.counts(), { city_sieges: 1, siege_assaults: 2, city_captures: 1, city_capture_squares: 1 });
});

test('readSieges is read-only and reports progress', async t => {
  const c = await setup(t); await c.war(); await c.assault();
  const writes = [], prepare = c.r.db.prepare.bind(c.r.db), batch = c.r.db.batch.bind(c.r.db);
  c.r.db.prepare = sql => { if (/^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i.test(sql)) writes.push(sql.slice(0, 40)); return prepare(sql); }; c.r.db.batch = s => { writes.push('batch'); return batch(s); };
  const list = await c.siege.readSieges(c.r.db, 'w1'); c.r.db.prepare = prepare; c.r.db.batch = batch;
  assert.deepEqual(writes, []); assert.equal(list.length, 1); assert.deepEqual([list[0].days, list[0].needed, list[0].capturedAt, list[0].attacker, list[0].defender], [1, 2, null, 'korund', 'kindle']);
  assert.deepEqual(await c.siege.readSieges(c.r.db, 'other'), []);
});
