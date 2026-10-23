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
  assert.doesNotMatch(readFileSync('lib/army-battle.ts', 'utf8'), /UPDATE|INSERT|owner/, 'never writes, never captures');
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
    assert.deepEqual(card.battle, { opponentNationId: 'korund', attacking: true, rounds: 0, status: 'attacker_won' }); assert.equal(card.strength, 5);
    assert.match(readFileSync('app/army-card.tsx', 'utf8'), /\{unit\.battle && <p>\{battleLine\(unit\.battle\)\}<\/p>\}/);
  });
}
