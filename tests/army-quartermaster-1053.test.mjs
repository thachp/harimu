/** #1053: quartermaster shifts extend a unit's supply range (docs §15.3 Logistics). Flag HARIMU_ARMY_QUARTERMASTER_ENABLED on top of the supply chain. SQLite + PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { localRuntime } from './helpers/local-runtime.mjs';

const SUPPLY = { HARIMU_ARMIES_ENABLED: 'true', HARIMU_WAR_ENABLED: 'true', HARIMU_ARMY_MAP_ENABLED: 'true', HARIMU_ARMY_SUPPLY_ENABLED: 'true' }, ON = { ...SUPPLY, HARIMU_ARMY_QUARTERMASTER_ENABLED: 'true' };
const boot = await localRuntime({ backend: 'sqlite' });
const Q = await boot.importModule('lib/army-quartermaster.ts'), S = await boot.importModule('lib/army-supply.ts'), M = await boot.importModule('lib/army-map.ts'); await boot.close();
const DAY = 7200;

test('rules: flag chain, pack key, constants, range math 0/1/3/5 shifts with cap, integer only', () => {
  assert.equal(Q.armyQuartermasterEnabled(ON), true); assert.equal(Q.armyQuartermasterEnabled(SUPPLY), false, 'unset means off');
  for (const k of Object.keys(ON)) assert.equal(Q.armyQuartermasterEnabled({ ...ON, [k]: 'false' }), false, k);
  assert.equal(Q.armyQuartermasterEnabled({ ...SUPPLY, HARIMU_ARMY_PACK: '{"HARIMU_ARMY_QUARTERMASTER_ENABLED":"true"}' }), true, 'read from the army pack');
  for (const [file, v] of [['wrangler.jsonc', 'true'], ['wrangler.prod.jsonc', 'false']]) assert.match(readFileSync(file, 'utf8'), new RegExp(`"HARIMU_ARMY_QUARTERMASTER_ENABLED": "${v}"`), file);
  assert.deepEqual([Q.QUARTERMASTER_SQUARES_PER_SHIFT, Q.QUARTERMASTER_MAX_EXTRA_SQUARES], [1, 3]);
  assert.deepEqual([0, 1, 2, 3, 4, 5, -2, 1.9].map(Q.quartermasterExtra), [0, 1, 2, 3, 3, 3, 0, 1]);
  assert.equal(Q.quartermasterWindowStart(10_000), 10_000 - DAY + 1);
});

test('supplyCutAt: a route cut at square 6 stays supplied with +1; extra 0 is the old output', () => {
  const plains = () => 'plains', depot = { x: 0, y: 0 }, route = n => Array.from({ length: n }, (_, i) => ({ x: i + 1, y: 0 }));
  assert.equal(S.supplyCutAt(depot, route(6), 100, plains), 100 + 6 * M.ARMY_MOVE_SECONDS_FAST, 'base: cut at square 6');
  assert.equal(S.supplyCutAt(depot, route(6), 100, plains, 1, 0), S.supplyCutAt(depot, route(6), 100, plains), 'extra 0 unchanged');
  assert.equal(S.supplyCutAt(depot, route(6), 100, plains, 1, 1), null, 'one shift: supplied');
  for (const [shifts, cutSquare] of [[0, 6], [1, 7], [3, 9], [5, 9]]) assert.equal(S.supplyCutAt(depot, route(12), 0, plains, 1, Q.quartermasterExtra(shifts)), cutSquare * M.ARMY_MOVE_SECONDS_FAST, `${shifts} shifts`);
  const war = { attacker_nation: 'kindle', defender_nation: 'korund', declared_at: 0, mobilization_ends_at: 0 };
  assert.deepEqual(S.unitSupply('kindle', [war], 10 ** 7, undefined, null, 0), S.unitSupply('kindle', [war], 10 ** 7), 'flag-off path identical');
});

for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: shift once per game day, non-member refused, range on the card, expiry at exactly one game day, flag off unchanged`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close()); await r.call('citizen', 'alice'); await r.call('citizen', 'bob');
    for (const [k, v] of Object.entries({ ...ON, HARIMU_ARMY_DRILLS_ENABLED: 'true' })) r.setFixtureEnv(k, v);
    assert.equal((await r.call('army', 'alice', { action: 'join', unitId: 'kindle-home-guard', requestId: 'qm-1053-join' })).status, 200);
    const now = Math.floor(r.now / 1000), mob = now - 10 * 86400;
    await r.db.prepare("INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,casus_belli,declared_by,declared_at,mobilization_ends_at) VALUES ('w1053','r-1053','kindle:korund','kindle','korund','','AI',?,?)").bind(mob - 172800, mob).run();
    const card = async () => (await r.call('army', 'alice')).data.army.unit.supply;
    assert.deepEqual([(await card()).rangeSquares, (await card()).quartermasterSquares], [5, 0]);
    // flag off: 404 before auth, and the card keeps its old supply shape
    r.setFixtureEnv('HARIMU_ARMY_QUARTERMASTER_ENABLED', 'false');
    assert.equal((await r.call('army/quartermaster', 'alice', { requestId: 'qm-1053-off' })).status, 404);
    const off = await card(); assert.equal('rangeSquares' in off, false); assert.equal('quartermasterSquares' in off, false);
    r.setFixtureEnv('HARIMU_ARMY_QUARTERMASTER_ENABLED', 'true');
    const bob = await r.call('army/quartermaster', 'bob', { requestId: 'qm-1053-bob' }); assert.equal(bob.status, 409); assert.equal(bob.data.reason, 'not_member');
    const first = await r.call('army/quartermaster', 'alice', { requestId: 'qm-1053-a1' }); assert.equal(first.status, 200); assert.equal(first.data.replayed, false);
    assert.equal((await r.call('army/quartermaster', 'alice', { requestId: 'qm-1053-a1' })).data.replayed, true, 'replay writes nothing');
    assert.equal((await r.call('army/quartermaster', 'bob', { requestId: 'qm-1053-a1' })).data.reason, 'request_conflict');
    const again = await r.call('army/quartermaster', 'alice', { requestId: 'qm-1053-a2' }); assert.equal(again.status, 409); assert.equal(again.data.reason, 'already_shifted');
    assert.deepEqual([(await card()).rangeSquares, (await card()).quartermasterSquares], [6, 1]);
    const posRange = async () => Object.fromEntries((await r.call('army/positions', null)).data.units.map(u => [u.nationId, u.supply.rangeSquares]));
    assert.deepEqual(await posRange(), { kindle: 6, korund: 5, aurelle: 5 }, 'M8: positions carry base 5 + 1 shift; no shift is base');
    // M8: positions cap: four more shifts on record (5 in the window) is +3, range 8; flag off drops the range key.
    for (const d of [1, 2, 3, 4]) await r.db.prepare("INSERT INTO army_quartermaster_shifts (request_id, clerk_user_id, unit_id, game_day, shifted_at) VALUES (?, 'alice', 'kindle-home-guard', ?, ?)").bind(`qm-1053-cap${d}`, -d, Math.floor(r.now / 1000)).run();
    assert.equal((await posRange()).kindle, 8, 'capped at base 5 + 3'); assert.equal((await card()).rangeSquares, 8);
    r.setFixtureEnv('HARIMU_ARMY_QUARTERMASTER_ENABLED', 'false'); assert.deepEqual(await posRange(), { kindle: undefined, korund: undefined, aurelle: undefined }, 'flag off: no range');
    r.setFixtureEnv('HARIMU_ARMY_QUARTERMASTER_ENABLED', 'true');
    await r.db.prepare("DELETE FROM army_quartermaster_shifts WHERE request_id LIKE 'qm-1053-cap%'").run();
    // M8: the overlay's cut state uses the extra range. At one second after the base-range cut, +3 squares still means supplied.
    const wars = await M.readActiveWars(r.db), march = M.unitMarch('kindle', wars, now), terr = M.terrainMap(), at = p => terr.get(`${p.x},${p.y}`);
    const baseCut = S.supplyCutAt(march.home, march.route, march.war.mobilization_ends_at, at), wideCut = S.supplyCutAt(march.home, march.route, march.war.mobilization_ends_at, at, 1, 3);
    assert.ok(baseCut !== null && (wideCut === null || wideCut > baseCut + 1), 'the fixture march leaves the base range first');
    const T = baseCut + 1, realNow = r.now; r.setNow(T * 1000);
    for (const d of [1, 2, 3]) await r.db.prepare("INSERT INTO army_quartermaster_shifts (request_id, clerk_user_id, unit_id, game_day, shifted_at) VALUES (?, 'alice', 'kindle-home-guard', ?, ?)").bind(`qm-1053-t${d}`, -10 - d, T).run();
    const kSup = async () => (await r.call('army/positions', null)).data.units.find(u => u.nationId === 'kindle').supply;
    assert.deepEqual(await kSup(), { cut: false, cutDays: 0, strengthLossPct: 0, rangeSquares: 8 }, 'supplied with +3');
    r.setFixtureEnv('HARIMU_ARMY_QUARTERMASTER_ENABLED', 'false'); assert.deepEqual(await kSup(), { cut: true, cutDays: 0, strengthLossPct: 0 }, 'flag off: base range, cut');
    r.setFixtureEnv('HARIMU_ARMY_QUARTERMASTER_ENABLED', 'true');
    await r.db.prepare("DELETE FROM army_quartermaster_shifts WHERE request_id LIKE 'qm-1053-t%'").run(); r.setNow(realNow);
    // flag off with a shift on record: supply identical to the no-shift output
    r.setFixtureEnv('HARIMU_ARMY_QUARTERMASTER_ENABLED', undefined); assert.deepEqual(await card(), off); r.setFixtureEnv('HARIMU_ARMY_QUARTERMASTER_ENABLED', 'true');
    const shiftedAt = Number((await r.db.prepare("SELECT shifted_at FROM army_quartermaster_shifts WHERE request_id='qm-1053-a1'").first()).shifted_at);
    r.setNow((shiftedAt + DAY - 1) * 1000); assert.equal((await card()).quartermasterSquares, 1, 'last second of the window');
    r.setNow((shiftedAt + DAY) * 1000); assert.equal((await card()).quartermasterSquares, 0, 'expired at exactly one game day');
    assert.equal((await r.call('army', 'alice', { action: 'leave', requestId: 'qm-1053-leave' })).status, 200);
    r.setNow(shiftedAt * 1000); assert.equal((await Q.readQuartermasterExtra(r.db, shiftedAt)).get('kindle'), undefined, 'a former member\'s shift no longer counts');
  });
}

for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: M11 a wounded member is refused; M7 a shift on record for another unit does not count`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close()); await r.call('citizen', 'alice'); await r.call('citizen', 'bob');
    for (const [k, v] of Object.entries({ ...ON, HARIMU_ARMY_DRILLS_ENABLED: 'true', HARIMU_ARMY_BATTLES_ENABLED: 'true' })) r.setFixtureEnv(k, v);
    for (const u of ['alice', 'bob']) assert.equal((await r.call('army', u, { action: 'join', unitId: 'kindle-home-guard', requestId: `qm-1053-j-${u}` })).status, 200);
    const now = Math.floor(r.now / 1000);
    await r.db.prepare("INSERT INTO army_wounds (battle_key, clerk_user_id, wounded_until) VALUES ('b1053', 'alice', ?)").bind(now + 3600).run();
    const hurt = await r.call('army/quartermaster', 'alice', { requestId: 'qm-1053-w1' });
    assert.equal(hurt.status, 409); assert.equal(hurt.data.reason, 'wounded'); assert.equal(hurt.data.error, 'You are wounded and out of action until you recover.'); assert.equal(hurt.data.woundedUntil, now + 3600);
    assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM army_quartermaster_shifts').first()).n), 0, 'no row written');
    // M7: bob's shift was logged for kindle, then bob is moved to another unit: it no longer counts for either unit.
    assert.equal((await r.call('army/quartermaster', 'bob', { requestId: 'qm-1053-b1' })).status, 200);
    assert.equal((await Q.readQuartermasterExtra(r.db, now)).get('kindle'), 1);
    await r.db.prepare("UPDATE army_members SET unit_id = 'korund-home-guard' WHERE clerk_user_id = 'bob'").run();
    const extra = await Q.readQuartermasterExtra(r.db, now); assert.equal(extra.get('kindle'), undefined); assert.equal(extra.get('korund'), undefined);
  });
}

test('card: range line and button come from army-copy and show only with the range', async () => {
  const card = readFileSync('app/army-card.tsx', 'utf8'), { unitMembership: AC } = await import('../lib/army-copy.ts');
  assert.equal(AC.supplyRange.text, 'Supply range: {n} squares (+{k} from quartermasters)');
  assert.match(card, /unit\.supply\?\.rangeSquares !== undefined && <p>\{supplyRangeLine/); assert.match(card, /unit\.supply\?\.rangeSquares !== undefined && <button/);
});
