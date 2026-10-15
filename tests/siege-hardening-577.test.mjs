/** #577 (slice C hardening of the siege PoC, #419): replay by request id, over-long ids, repair after a crash, nothing movable, and window-start day counting. SQLite and PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';
import * as s from '../lib/siege.ts';

const D = 86400, DAY1 = Date.UTC(2026, 9, 10, 22, 30); // Kindle's seed window is 22:00-02:00 UTC
async function setup(t, backend) {
  const r = await localRuntime(backend ? { backend } : {}); t.after(() => r.close()); r.setNow(DAY1);
  const siege = await r.importModule('lib/siege-actions.ts'), nowS = () => Math.floor(r.now / 1000);
  const run = (sql, ...b) => r.db.prepare(sql).bind(...b).run(), one = (sql, ...b) => r.db.prepare(sql).bind(...b).first(), all = async (sql, ...b) => (await r.db.prepare(sql).bind(...b).all()).results.map(x => ({ ...x }));
  await run('INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,declared_by,declared_at,mobilization_ends_at) VALUES (?,?,?,?,?,?,?,?)', 'w1', 'rq-w1', 'kindle:korund', 'korund', 'kindle', 'test', nowS() - 5 * D, nowS() - 3 * D);
  const outpost = (await (await r.importModule('lib/map-zones.ts')).mvpNations.find(x => x.id === 'kindle')).outpost;
  let n = 0;
  const assault = (over = {}, at) => { if (at !== undefined) r.setNow(at); return siege.resolveCityAssault(r.db, { nation: 'korund', warId: 'w1', cityKind: 'outpost', cityId: 'kindle', requestId: `req-hard-${++n}`, ...over }, nowS(), true); };
  const count = async table => (await one(`SELECT COUNT(*) AS n FROM ${table}`)).n, owner = async () => (await one('SELECT owner FROM world_squares WHERE x=? AND y=?', outpost.x, outpost.y)).owner;
  return { r, run, one, all, assault, count, owner, outpost, nowS };
}
const fail = (res, status, reason) => { assert.equal(res.ok, false, JSON.stringify(res)); assert.deepEqual([res.status, res.reason], [status, reason], res.error); };
const H = 3600 * 1000;

test('windowDay: a window that spans midnight is one day; start hour 0 is the UTC day; bad input is NaN', () => {
  const at = (day, hour, min = 0) => Date.UTC(2026, 9, day, hour, min) / 1000;
  assert.equal(s.windowDay(22, at(10, 22)), s.windowDay(22, at(11, 1, 59)), 'Kindle 22:00-02:00: 23:00 and 01:59 next day are the same day');
  assert.notEqual(s.windowDay(22, at(10, 22)), s.windowDay(22, at(11, 22)), 'the next window is the next day');
  assert.equal(s.windowDay(14, at(10, 14)), s.windowDay(14, at(10, 17, 59)));
  assert.equal(s.windowDay(0, at(10, 5)), s.utcDay(at(10, 5)));
  for (const bad of [NaN, -1, 24, 1.5, '22']) assert.ok(Number.isNaN(s.windowDay(bad, at(10, 22))), String(bad));
  assert.ok(Number.isNaN(s.windowDay(22, at(10, 22) * 1000)), 'milliseconds');
  assert.equal(s.recordAssault([s.windowDay(22, at(10, 23))], at(11, 1), 22).outcome, 'duplicate_day');
  assert.equal(s.recordAssault([s.windowDay(22, at(10, 23))], at(11, 23), 22).outcome, 'captured');
});

for (const backend of ['sqlite', 'postgres']) {
  test(`window-start day: two assaults in one midnight-spanning window count once, the next window captures (${backend})`, async t => {
    const c = await setup(t, backend);
    assert.equal((await c.assault()).ok, true);
    fail(await c.assault({}, DAY1 + 2 * H), 409, 'already_assaulted_today'); // 00:30 UTC next day: same Kindle window
    assert.equal(await c.count('siege_assaults'), 1);
    const second = await c.assault({}, DAY1 + 24 * H);
    assert.equal(second.ok, true, JSON.stringify(second)); assert.deepEqual(second.captured, { moved: 1, keptPrivate: 0 }); assert.equal(await c.owner(), 'korund');
    const days = (await c.all('SELECT assault_day FROM siege_assaults ORDER BY assault_day')).map(x => Number(x.assault_day));
    assert.deepEqual(days, [s.windowDay(22, DAY1 / 1000), s.windowDay(22, DAY1 / 1000 + D)]); assert.equal(days[1] - days[0], 1);
  });

  test(`#577 item 1: a simultaneous call with the same request id replays instead of being refused (${backend})`, async t => {
    const c = await setup(t, backend);
    assert.equal((await c.assault({ requestId: 'req-same-0001' })).ok, true);
    // The racing call did not yet see the row at its first lookup (simulated); it must find it again before refusing.
    const prepare = c.r.db.prepare.bind(c.r.db); let blinded = false;
    c.r.db.prepare = sql => { if (!blinded && sql.startsWith('SELECT a.request_id')) { blinded = true; return { bind: () => ({ first: async () => null }) }; } return prepare(sql); };
    const again = await c.assault({ requestId: 'req-same-0001' }, DAY1 + H);
    c.r.db.prepare = prepare;
    assert.equal(blinded, true); assert.equal(again.ok, true, JSON.stringify(again)); assert.equal(again.replay, true); assert.equal(await c.count('siege_assaults'), 1);
    const [x, y] = await Promise.all([c.assault({ requestId: 'req-same-0002' }, DAY1 + 24 * H), c.assault({ requestId: 'req-same-0002' })]);
    assert.deepEqual([x.ok, y.ok], [true, true], JSON.stringify([x, y])); assert.equal(await c.count('siege_assaults'), 2); assert.equal(await c.count('city_captures'), 1);
  });

  test(`#577 item 3: a new request id on the same day after a crash repairs the capture (${backend})`, async t => {
    const c = await setup(t, backend);
    assert.equal((await c.assault()).ok, true);
    const sid = (await c.one('SELECT id FROM city_sieges')).id, at2 = Math.floor((DAY1 + 24 * H) / 1000);
    await c.run('INSERT INTO siege_assaults (request_id,siege_id,assault_day,assaulted_at) VALUES (?,?,?,?)', 'req-crashed-1', sid, s.windowDay(22, at2), at2); // second day counted, capture never written
    assert.equal(await c.owner(), 'kindle');
    const fixed = await c.assault({ requestId: 'req-newid-0001' }, DAY1 + 24 * H + 1800 * 1000);
    assert.equal(fixed.ok, true, JSON.stringify(fixed)); assert.equal(fixed.repaired, true); assert.deepEqual(fixed.captured, { moved: 1, keptPrivate: 0 });
    assert.equal(await c.owner(), 'korund'); assert.equal(await c.count('siege_assaults'), 2, 'the repair adds no assault row');
    assert.equal((await c.one('SELECT request_id FROM city_captures')).request_id, 'req-crashed-1', 'the capture belongs to the assault that completed the second day');
    fail(await c.assault({ requestId: 'req-newid-0002' }), 409, 'already_captured');
  });

  test(`#577 item 4: a city whose squares are all privately bought is refused with nothing written (${backend})`, async t => {
    const c = await setup(t, backend);
    await c.run("INSERT INTO world_square_purchases (request_id,clerk_user_id,nation_id,x,y,price_minor,purchased_at) VALUES ('sq-o1','alice','kindle',?,?,2500,1)", c.outpost.x, c.outpost.y);
    const before = [await c.count('city_sieges'), await c.count('siege_assaults'), await c.count('city_captures')];
    fail(await c.assault(), 409, 'nothing_to_capture');
    assert.deepEqual([await c.count('city_sieges'), await c.count('siege_assaults'), await c.count('city_captures')], before); assert.equal(await c.owner(), 'kindle');
    // Bought between the first and the second assault: the second is refused, no capture is marked.
    const c2 = await setup(t, backend); assert.equal((await c2.assault()).ok, true);
    await c2.run("INSERT INTO world_square_purchases (request_id,clerk_user_id,nation_id,x,y,price_minor,purchased_at) VALUES ('sq-o2','alice','kindle',?,?,2500,1)", c2.outpost.x, c2.outpost.y);
    fail(await c2.assault({}, DAY1 + 24 * H), 409, 'nothing_to_capture');
    assert.deepEqual([await c2.count('siege_assaults'), await c2.count('city_captures'), (await c2.one('SELECT captured_at FROM city_sieges')).captured_at], [1, 0, null]);
  });
}

test('#577 item 2: an over-long city id is a 409 with its own reason, and nothing is written', async t => {
  const c = await setup(t);
  fail(await c.assault({ cityKind: 'founded', cityId: 'c'.repeat(73) }), 409, 'city_id_too_long');
  fail(await c.assault({ cityId: 'k'.repeat(200) }), 409, 'city_id_too_long');
  assert.equal(await c.count('city_sieges'), 0);
  assert.equal((await c.assault({ cityKind: 'founded', cityId: 'c'.repeat(72) })).reason, 'not_a_city', '72 characters still fit the key (and then fail as an unknown city)');
});
