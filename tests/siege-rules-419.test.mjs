/** #419 slice A: siege schema (migration 0050) and the pure rules in lib/siege.ts. Plain-Node import: lib/siege.ts must stay import-free. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { postgresMigrations, isDestructive } from '../scripts/postgres-migrations.mjs';
import * as s from '../lib/siege.ts';

const D = 86400, T = 20_000 * D;
const sq = (x, y, over = {}) => ({ x, y, zone: 'frontier', owner: 'korund', feature: null, ...over });

test('only Frontier outposts and founded Frontier cities can be besieged; everything else fails closed', () => {
  assert.deepEqual(s.capturableCity('outpost', sq(1, 1, { feature: 'border outpost' })), { ok: true });
  assert.deepEqual(s.capturableCity('founded', sq(1, 1, { feature: 'city' })), { ok: true });
  const no = (kind, square, reason) => assert.deepEqual(s.capturableCity(kind, square), { ok: false, reason });
  no('outpost', sq(1, 1, { zone: 'heartland', feature: 'capital' }), 'capital');
  no('founded', sq(1, 1, { feature: 'capital' }), 'capital');
  no('outpost', sq(1, 1, { zone: 'heartland', feature: 'border outpost' }), 'heartland');
  no('founded', sq(1, 1, { zone: 'heartland', feature: 'city' }), 'heartland');
  no('founded', sq(1, 1, { zone: 'wildlands', feature: 'city' }), 'not_frontier');
  no('outpost', sq(1, 1, { zone: 'commons', feature: 'border outpost' }), 'not_frontier');
  no('outpost', sq(1, 1, { feature: 'city' }), 'not_a_city');
  no('founded', sq(1, 1, { feature: 'border outpost' }), 'not_a_city');
  no('founded', sq(1, 1), 'not_a_city');
  no('capital', sq(1, 1, { feature: 'capital' }), 'not_a_city');
  no(undefined, sq(1, 1), 'not_a_city');
  no('outpost', undefined, 'not_a_city');
});

test('the refusal order is fixed: city, captured, war, side, window', () => {
  const ok = { ok: true }, base = { warStatus: 'active', attacker: 'korund', defender: 'kindle', actingNation: 'korund', inDefenseWindow: true, city: ok, alreadyCaptured: false };
  assert.equal(s.assaultRefusal(base), null);
  assert.equal(s.assaultRefusal({ ...base, city: { ok: false, reason: 'heartland' }, warStatus: 'ended', inDefenseWindow: false }), 'heartland');
  assert.equal(s.assaultRefusal({ ...base, alreadyCaptured: true, warStatus: 'ended' }), 'already_captured');
  for (const warStatus of ['mobilizing', 'ended', 'none', '']) assert.equal(s.assaultRefusal({ ...base, warStatus, inDefenseWindow: false }), 'war_not_active', warStatus);
  assert.equal(s.assaultRefusal({ ...base, actingNation: 'kindle', inDefenseWindow: false }), 'wrong_side', 'the defender cannot assault its own city');
  assert.equal(s.assaultRefusal({ ...base, actingNation: 'aurelle' }), 'wrong_side');
  assert.equal(s.assaultRefusal({ ...base, inDefenseWindow: false }), 'outside_window');
});

test('capture needs successful assaults on two different UTC days', () => {
  assert.equal(s.utcDay(T), 20_000); assert.equal(s.utcDay(T + D - 1), 20_000); assert.equal(s.utcDay(T + D), 20_001);
  const first = s.recordAssault([], T + 100);
  assert.deepEqual([first.outcome, first.distinctDays], ['recorded', 1]);
  const same = s.recordAssault(first.days, T + D - 1);
  assert.deepEqual([same.outcome, same.distinctDays], ['duplicate_day', 1], 'a second assault the same UTC day does not count, however late');
  const next = s.recordAssault(first.days, T + D);
  assert.deepEqual([next.outcome, next.distinctDays], ['captured', 2]);
  assert.deepEqual(s.recordAssault([20_005], T).days, [20_000, 20_005], 'earlier days sort in; order of arrival does not matter');
  assert.equal(s.recordAssault([20_000, 20_000], T).outcome, 'duplicate_day', 'duplicates in the input are one day');
  assert.deepEqual(s.siegeProgress([1, 1, 1]), { count: 1, needed: 2, captured: false });
  assert.equal(s.siegeProgress([1, 2]).captured, true);
});

test('timestamps must be unix seconds: NaN, fractions, negatives and milliseconds are rejected (QA2 on #559)', () => {
  for (const bad of [NaN, Infinity, -1, 1.5, T * 1000, '20000', null, undefined]) {
    assert.equal(s.validSeconds(bad), false, String(bad)); assert.ok(Number.isNaN(s.utcDay(bad)), `utcDay(${String(bad)})`);
    assert.equal(s.recordAssault([20_000], bad).outcome, 'invalid_time', String(bad));
  }
  assert.equal(s.validSeconds(T), true); assert.equal(s.validSeconds(0), true);
  assert.deepEqual(s.recordAssault([20_000], Date.now()).days, [20_000], 'a millisecond clock never counts as a far-future day');
  assert.equal(s.maxCityIdLength + 'outpost:'.length <= 80, true, 'the longest key fits city_sieges.city_key');
});

test('claim squares: an outpost is one square, a founded city its radius-2 block, clipped to the grid', () => {
  const bounds = { width: 24, height: 18 };
  assert.deepEqual(s.claimSquares('outpost', { x: 5, y: 6 }, bounds), [{ x: 5, y: 6 }]);
  assert.equal(s.claimSquares('founded', { x: 10, y: 10 }, bounds).length, 25);
  assert.equal(s.claimSquares('founded', { x: 0, y: 0 }, bounds).length, 9);
  assert.equal(s.claimSquares('founded', { x: 23, y: 17 }, bounds).length, 9);
  assert.deepEqual(s.claimSquares('outpost', { x: 30, y: 6 }, bounds), []);
});

test('planCapture moves only national control of unpurchased squares the defender holds', () => {
  const squares = [sq(1, 1, { owner: 'kindle' }), sq(2, 1, { owner: 'kindle' }), sq(3, 1, { owner: 'aurelle' }), sq(4, 1, { owner: null })];
  const plan = s.planCapture(squares, new Set(['2,1']), 'korund', 'kindle');
  assert.deepEqual(plan.transfer, [{ x: 1, y: 1, from: 'kindle', to: 'korund' }]);
  assert.deepEqual(plan.keptPrivate, [{ x: 2, y: 1 }], 'a purchased square keeps its owner and its purchase row');
  assert.deepEqual(s.planCapture(squares, new Set(), 'korund', 'kindle').transfer.map(t => `${t.x},${t.y}`), ['1,1', '2,1']);
  assert.deepEqual(s.planCapture([], new Set(), 'korund', 'kindle'), { transfer: [], keptPrivate: [] });
});

test('lib/siege.ts is import-free and declares no I/O', async () => {
  const src = await readFile(new URL('../lib/siege.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /^\s*import\s/m); assert.doesNotMatch(src, /\bfetch\(|\.prepare\(|\.batch\(/);
  assert.deepEqual(s.siegeCityKey('outpost', 'kindle'), 'outpost:kindle'); assert.equal(s.siegeCityKey('founded', 'c1'), 'city:c1');
});

test('migration 0050 is additive in both dialects and matches the inline schema tables', async () => {
  const tables = ['city_sieges', 'siege_assaults', 'city_captures', 'city_capture_squares'];
  for (const file of ['../drizzle/0050_city_sieges.sql', '../db/postgres/0050_city_sieges.sql']) {
    const sql = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.equal(isDestructive(sql), false, file); assert.doesNotMatch(sql, /\b(DROP|ALTER|RENAME|TRUNCATE|UPDATE|INSERT)\b|DELETE\s+FROM/i, file);
    assert.deepEqual([...sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(m => m[1]), tables, file);
  }
  assert.deepEqual(postgresMigrations().find(m => m.file.startsWith('0050_')).tables, tables);
  assert.deepEqual(s.siegeSchemas.filter(q => q.startsWith('CREATE TABLE')).map(q => /EXISTS (\w+)/.exec(q)[1]), tables);
});

for (const backend of ['sqlite', 'postgres']) test(`the siege tables enforce their rules on ${backend}`, async t => {
  const r = await localRuntime(backend === 'postgres' ? { backend } : {}); t.after(() => r.close());
  const run = (sql, ...b) => r.db.prepare(sql).bind(...b).run();
  const count = async table => (await r.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n;
  const rejects = (sql, ...b) => assert.rejects(run(sql, ...b), undefined, sql.slice(0, 60));
  for (const table of ['city_sieges', 'siege_assaults', 'city_captures', 'city_capture_squares']) assert.equal(await count(table), 0, `${table} is empty on a fresh database`);
  await run('INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,declared_by,declared_at,mobilization_ends_at) VALUES (?,?,?,?,?,?,?,?)', 'w1', 'rq-w1', 'kindle:korund', 'korund', 'kindle', 'test', T, T + 172800);
  const siege = (id, over = {}) => run('INSERT INTO city_sieges (id,war_id,city_key,city_kind,center_x,center_y,attacker_nation,defender_nation,created_at) VALUES (?,?,?,?,?,?,?,?,?)', id, over.war ?? 'w1', over.key ?? 'outpost:kindle', over.kind ?? 'outpost', 3, 4, over.att ?? 'korund', over.def ?? 'kindle', T);
  await siege('s1');
  await rejects('INSERT INTO city_sieges (id,war_id,city_key,city_kind,center_x,center_y,attacker_nation,defender_nation,created_at) VALUES (?,?,?,?,?,?,?,?,?)', 's2', 'w1', 'outpost:kindle', 'outpost', 3, 4, 'korund', 'kindle', T);
  await rejects('INSERT INTO city_sieges (id,war_id,city_key,city_kind,center_x,center_y,attacker_nation,defender_nation,created_at) VALUES (?,?,?,?,?,?,?,?,?)', 's3', 'w1', 'outpost:aurelle', 'outpost', 3, 4, 'korund', 'korund', T);
  await rejects('INSERT INTO city_sieges (id,war_id,city_key,city_kind,center_x,center_y,attacker_nation,defender_nation,created_at) VALUES (?,?,?,?,?,?,?,?,?)', 's4', 'w1', 'capital:kindle', 'capital', 3, 4, 'korund', 'kindle', T);
  await rejects('INSERT INTO city_sieges (id,war_id,city_key,city_kind,center_x,center_y,attacker_nation,defender_nation,created_at) VALUES (?,?,?,?,?,?,?,?,?)', 's5', 'no-war', 'outpost:x', 'outpost', 3, 4, 'korund', 'kindle', T);
  const assault = (req, day, siegeId = 's1') => run('INSERT INTO siege_assaults (request_id,siege_id,assault_day,assaulted_at) VALUES (?,?,?,?)', req, siegeId, day, day * D + 5);
  await assault('a1', 20_000); await rejects('INSERT INTO siege_assaults (request_id,siege_id,assault_day,assaulted_at) VALUES (?,?,?,?)', 'a1', 's1', 20_001, 1);
  await rejects('INSERT INTO siege_assaults (request_id,siege_id,assault_day,assaulted_at) VALUES (?,?,?,?)', 'a2', 's1', 20_000, 1);
  await rejects('INSERT INTO siege_assaults (request_id,siege_id,assault_day,assaulted_at) VALUES (?,?,?,?)', 'a3', 'no-siege', 20_001, 1);
  await assault('a4', 20_001);
  const capture = (id, req, over = {}) => run('INSERT INTO city_captures (id,siege_id,war_id,request_id,attacker_nation,defender_nation,squares_transferred,squares_kept_private,captured_at) VALUES (?,?,?,?,?,?,?,?,?)', id, over.siege ?? 's1', 'w1', req, 'korund', 'kindle', over.moved ?? 1, 0, T);
  await capture('c1', 'a4');
  // #933: UNIQUE(siege_id) is gone so a second partial-capture step on the same siege is allowed; request_id stays unique.
  await capture('c2', 'a5');
  await rejects('INSERT INTO city_captures (id,siege_id,war_id,request_id,attacker_nation,defender_nation,squares_transferred,squares_kept_private,captured_at) VALUES (?,?,?,?,?,?,?,?,?)', 'c3', 's1', 'w1', 'a4', 'korund', 'kindle', 1, 0, T);
  await rejects('INSERT INTO city_captures (id,siege_id,war_id,request_id,attacker_nation,defender_nation,squares_transferred,squares_kept_private,captured_at) VALUES (?,?,?,?,?,?,?,?,?)', 'c4', 's1', 'w1', 'a6', 'korund', 'kindle', -1, 0, T);
  await run('INSERT INTO city_capture_squares (capture_id,x,y,from_nation,to_nation) VALUES (?,?,?,?,?)', 'c1', 3, 4, 'kindle', 'korund');
  await rejects('INSERT INTO city_capture_squares (capture_id,x,y,from_nation,to_nation) VALUES (?,?,?,?,?)', 'c1', 3, 4, 'kindle', 'korund');
  await rejects('INSERT INTO city_capture_squares (capture_id,x,y,from_nation,to_nation) VALUES (?,?,?,?,?)', 'no-capture', 5, 5, 'kindle', 'korund');
  assert.deepEqual([await count('city_sieges'), await count('siege_assaults'), await count('city_captures'), await count('city_capture_squares')], [1, 2, 2, 1]);
  await run('DELETE FROM wars WHERE id=?', 'w1');
  assert.deepEqual([await count('city_sieges'), await count('siege_assaults'), await count('city_captures'), await count('city_capture_squares')], [0, 0, 0, 0], 'ending a war record cascades the siege rows');
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM world_squares').first()).n > 0, true, 'the map is untouched');
});
