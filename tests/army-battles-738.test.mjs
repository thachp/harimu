/** #738 battles slice (docs §15.3 Resolution). ARC: a battle starts when an attacking unit is staged next to the defender's capital; deterministic,
 *  from current strength (with the #897 supply loss) and morale, in 10-minute rounds; the capital is never captured. Derived on read. SQLite + PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { localRuntime } from './helpers/local-runtime.mjs';

const SUPPLY = { HARIMU_ARMIES_ENABLED: 'true', HARIMU_WAR_ENABLED: 'true', HARIMU_ARMY_MAP_ENABLED: 'true', HARIMU_ARMY_SUPPLY_ENABLED: 'true' }, ON = { ...SUPPLY, HARIMU_ARMY_BATTLES_ENABLED: 'true' };
const boot = await localRuntime({ backend: 'sqlite' });
const B = await boot.importModule('lib/army-battle.ts'), M = await boot.importModule('lib/army-map.ts'); await boot.close();

test('rules: flag chain (unset means off), named constants, deterministic rounds, retreat, max-round decision, ties to the defender', () => {
  assert.equal(B.armyBattlesEnabled(ON), true); assert.equal(B.armyBattlesEnabled(SUPPLY), false, 'unset means off');
  for (const k of Object.keys(ON)) assert.equal(B.armyBattlesEnabled({ ...ON, [k]: 'false' }), false, k);
  assert.deepEqual([B.BATTLE_ROUND_SECONDS, B.BATTLE_MAX_ROUNDS, B.BATTLE_DAMAGE_PCT, B.BATTLE_FORTIFICATION_BONUS_PCT, B.BATTLE_RETREAT_BELOW_PCT], [600, 6, 20, 25, 50]);
  const strong = { strength: 100, morale: 100 }, even = { strength: 100, morale: 100 };
  assert.deepEqual(B.resolveBattle(strong, even, 0), { rounds: 0, attackerStrength: 100, defenderStrength: 100, status: 'ongoing', retreated: null });
  assert.deepEqual(B.resolveBattle(strong, even, 1), { rounds: 1, attackerStrength: 75, defenderStrength: 80, status: 'ongoing', retreated: null }, 'the fortified defender hits 25% harder');
  const evenFight = B.resolveBattle(strong, even, 99); assert.equal(evenFight.status, 'defender_won'); assert.equal(evenFight.retreated, 'attacker'); assert.ok(evenFight.rounds <= B.BATTLE_MAX_ROUNDS);
  assert.deepEqual(B.resolveBattle(strong, even, 99), evenFight, 'deterministic');
  const big = B.resolveBattle({ strength: 300, morale: 100 }, { strength: 100, morale: 50 }, 99); assert.deepEqual([big.status, big.retreated], ['attacker_won', 'defender']);
  assert.deepEqual(B.resolveBattle({ strength: 0, morale: 50 }, even, 5).status, 'defender_won', 'an empty attacking unit falls back at once');
  assert.deepEqual(B.resolveBattle(strong, { strength: 0, morale: 50 }, 5).status, 'attacker_won', 'an empty defending unit falls back at once');
  const mirror = B.resolveBattle({ strength: 1000, morale: 50 }, { strength: 1000, morale: 40 }, 6); assert.equal(mirror.rounds, 6);
  assert.equal(mirror.status, mirror.attackerStrength * 1000 > mirror.defenderStrength * 1000 ? 'attacker_won' : 'defender_won', 'after max rounds: more of its start left wins, ties to the defender');
  assert.deepEqual([B.roundsAt(1000, 999), B.roundsAt(1000, 1599), B.roundsAt(1000, 1600)], [0, 0, 1]);
  const src = readFileSync('lib/army-battle.ts', 'utf8').split('export function resolveBattle')[1].split('\n}')[0]; assert.doesNotMatch(src, /[^\w.]([2-9]|\d{2,})\b/, 'no inline numbers');
  const bsrc = readFileSync('lib/army-battle.ts', 'utf8'); assert.doesNotMatch(bsrc, /UPDATE|DELETE|owner/, 'never rewrites, never captures');
  assert.deepEqual(bsrc.match(/INSERT[^`]*?DO NOTHING/gs)?.length, (bsrc.match(/INSERT/g) ?? []).length, 'every insert is conditional (store once)');
});

async function spy(r, fn) { const prepare = r.db.prepare.bind(r.db), seen = { sql: [] }; r.db.prepare = q => { seen.sql.push(q); return prepare(q); }; try { seen.result = await fn(); } finally { r.db.prepare = prepare; } return seen; }
for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: flag off (any flag) is 404 before auth or any database access; the card has no battle`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close()); await r.call('citizen', 'alice');
    for (const [k, v] of Object.entries(ON)) r.setFixtureEnv(k, v);
    for (const k of Object.keys(ON)) {
      r.setFixtureEnv(k, 'false');
      const off = await spy(r, async () => [await r.call('army/battles', null), await r.call('army/battles', 'alice')]);
      assert.deepEqual(off.result.map(x => x.status), [404, 404], k); assert.deepEqual(off.sql, [], k);
      r.setFixtureEnv(k, 'true');
    }
    r.setFixtureEnv('HARIMU_ARMY_BATTLES_ENABLED', undefined); assert.equal((await r.call('army/battles', null)).status, 404, 'unset means off');
  });

  test(`${backend}: a staged attacker fights; GET never writes; the card shows the battle and the strength left; no capital changes hands`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close()); await r.call('citizen', 'alice');
    for (const [k, v] of Object.entries({ ...ON, HARIMU_ARMY_DRILLS_ENABLED: 'true' })) r.setFixtureEnv(k, v);
    assert.equal((await r.call('army', 'alice', { action: 'join', unitId: 'kindle-home-guard', requestId: 'battle-738-join' })).status, 200);
    const now = Math.floor(r.now / 1000), mob = now - 30 * 86400;
    await r.db.prepare("INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,casus_belli,declared_by,declared_at,mobilization_ends_at) VALUES ('wb','r-738-bat1','kindle:korund','kindle','korund','','AI',?,?)").bind(mob - 172800, mob).run();
    const owners = async () => (await r.db.prepare("SELECT owner FROM world_squares WHERE feature = 'capital' ORDER BY x").all()).results;
    const before = await owners();
    const read = await spy(r, () => r.call('army/battles', null));
    assert.equal(read.result.status, 200); assert.deepEqual(read.sql.filter(q => /^\s*(INSERT|UPDATE|DELETE)/i.test(q)), [], 'never writes');
    const [b] = read.result.data.battles; assert.equal(read.result.data.battles.length, 1);
    assert.deepEqual([b.attackerNationId, b.defenderNationId], ['kindle', 'korund']);
    assert.equal(b.startedAt, M.marchArrivalAt(M.unitMarch('kindle', [{ attacker_nation: 'kindle', defender_nation: 'korund', declared_at: mob - 172800, mobilization_ends_at: mob }], now)));
    assert.deepEqual([b.status, b.retreated], ['attacker_won', 'defender'], 'one Kindle member (10, halved by the cut supply to 5) against an empty Korund unit');
    assert.deepEqual(await owners(), before, 'the capital is never captured');
    assert.deepEqual((await r.call('army/battles', null)).data, read.result.data, 'deterministic on repeat reads');
    const card = (await r.call('army', 'alice')).data.army.unit;
    assert.deepEqual(card.battle, { opponentNationId: 'korund', attacking: true, rounds: 0, status: 'attacker_won', stances: { hold: 1, advance: 0, fall_back: 0 }, opponentStances: { hold: 0, advance: 0, fall_back: 0 } }); assert.equal(card.strength, 5);
    assert.match(readFileSync('app/army-card.tsx', 'utf8'), /\{unit\.battle && <p>\{battleLine\(unit\.battle\)\}<\/p>\}/);
  });

  test(`${backend}: the world tick stores a finished battle once; concurrent ticks store one row; a later strength change never alters it; GET reads it`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close()); await r.call('citizen', 'alice');
    for (const [k, v] of Object.entries({ ...ON, HARIMU_ARMY_DRILLS_ENABLED: 'true' })) r.setFixtureEnv(k, v);
    assert.equal((await r.call('army', 'alice', { action: 'join', unitId: 'kindle-home-guard', requestId: 'battle-738-join2' })).status, 200);
    const now = Math.floor(r.now / 1000), mob = now - 30 * 86400;
    await r.db.prepare("INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,casus_belli,declared_by,declared_at,mobilization_ends_at) VALUES ('wr','r-738-bat2','kindle:korund','kindle','korund','','AI',?,?)").bind(mob - 172800, mob).run();
    const AB = await r.importModule('lib/army-battle.ts');
    await Promise.all([AB.recordFinishedBattles(r.db, now), AB.recordFinishedBattles(r.db, now), r.call('world', null)]);
    const rows = (await r.db.prepare('SELECT * FROM army_battles').all()).results;
    assert.equal(rows.length, 1, 'exactly one stored row'); assert.deepEqual([rows[0].war_id, rows[0].attacker_unit, rows[0].status, Number(rows[0].attacker_strength)], ['wr', 'kindle-home-guard', 'attacker_won', 5]);
    const A = await r.importModule('lib/army.ts'), strength = async () => (await A.readUnitReadiness(r.db, 'kindle-home-guard', now)).strength;
    const before = await strength();
    await r.call('citizen', 'carol'); // a second Kindle soldier joins after the battle was stored (seeded directly: the fixture citizen may be another nation)
    await r.db.prepare("INSERT INTO army_members (clerk_user_id, unit_id, stance, joined_at, request_id) SELECT c.clerk_user_id, m.unit_id, m.stance, m.joined_at, 'battle-738-join3' FROM citizens c, army_members m WHERE m.unit_id = 'kindle-home-guard' AND c.clerk_user_id NOT IN (SELECT clerk_user_id FROM army_members) LIMIT 1").run();
    assert.ok(await strength() > before, 'the attacking unit really grew after the battle was stored');
    await AB.recordFinishedBattles(r.db, now + 3600);
    const after = (await r.db.prepare('SELECT * FROM army_battles').all()).results;
    assert.deepEqual(after, rows, 'replay leaves the stored result unchanged');
    const read = await spy(r, () => r.call('army/battles', null));
    assert.deepEqual(read.sql.filter(q => /^\s*(INSERT|UPDATE|DELETE)/i.test(q)), [], 'GET never writes');
    assert.deepEqual([read.result.data.battles[0].status, read.result.data.battles[0].attackerStrength, read.result.data.battles[0].stored], ['attacker_won', 5, true]);
  });
}

/** #679: an unresolved battle used to read readiness (two statements) and then the carried-loss row. Those reads do not depend on each other. */
test('an ongoing battle reads readiness and carried losses together, and the result matches the serial read (#679)', async t => {
  const r = await localRuntime({ backend: 'sqlite' }); t.after(() => r.close());
  await r.call('citizen', 'alice');
  for (const [k, v] of Object.entries({ ...ON, HARIMU_ARMY_DRILLS_ENABLED: 'true' })) r.setFixtureEnv(k, v);
  assert.equal((await r.call('army', 'alice', { action: 'join', unitId: 'kindle-home-guard', requestId: 'battle-679-join' })).status, 200);
  await r.call('citizen', 'bob');
  await r.db.prepare("INSERT INTO army_members (clerk_user_id, unit_id, stance, joined_at, request_id) SELECT clerk_user_id, 'korund-home-guard', 'hold', 0, ? FROM citizens WHERE clerk_user_id NOT IN (SELECT clerk_user_id FROM army_members) LIMIT 1").bind('battle-679-k').run();
  const now = Math.floor(r.now / 1000);
  const march = M.unitMarch('kindle', [{ id: 'w679', attacker_nation: 'kindle', defender_nation: 'korund', mobilization_ends_at: 0, declared_at: 0 }], 1);
  assert.ok(march, 'the probe march exists');
  const mob = now - M.marchArrivalAt(march);
  await r.db.prepare("INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,casus_belli,declared_by,declared_at,mobilization_ends_at) VALUES ('w679','r-679','kindle:korund','kindle','korund','','AI',?,?)").bind(mob - 172800, mob).run();
  const AB = await r.importModule('lib/army-battle.ts'), Map = await r.importModule('lib/army-map.ts');
  const wars = await Map.readActiveWars(r.db);
  const serial = await AB.readBattles(r.db, wars, now);
  assert.equal(serial.length, 1); assert.equal(serial[0].stored, false); assert.equal(serial[0].status, 'ongoing', 'both sides still standing at 0 rounds');
  await AB.recordFinishedBattles(r.db, now);
  assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM army_battles').first()).n), 0, 'an ongoing battle is not stored');
  const D = 60, real = r.db;
  const slow = new Proxy(real, { get(target, key) {
    if (key !== 'prepare') { const value = target[key]; return typeof value === 'function' ? value.bind(target) : value; }
    const wrap = st => new Proxy(st, { get(x, k) { const v = x[k]; if (typeof v !== 'function') return v;
      if (k === 'bind') return (...a) => wrap(v.apply(x, a));
      if (['first', 'all', 'run', 'raw'].includes(k)) return async (...a) => { await new Promise(res => setTimeout(res, D)); return v.apply(x, a); };
      return v.bind(x); } });
    return sql => wrap(target.prepare(sql));
  } });
  const started = performance.now(), board = await AB.readBattles(slow, wars, now), trips = (performance.now() - started) / D;
  assert.deepEqual(board, serial, 'the parallel reads produce the same battle');
  assert.ok(trips < 2.9, `~${trips.toFixed(1)} round trips; the stored-row read, then readiness and the loss row together (about 4 when those waited in turn)`);
});
