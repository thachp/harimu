/** #738 battle losses (ARC): a unit's last stored battle (#910) caps its strength at what it had left, recovering per game day. Derived on read from
 *  army_battles (no new table, no new flag: HARIMU_ARMY_BATTLES_ENABLED). SQLite + PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

const ON = { HARIMU_ARMIES_ENABLED: 'true', HARIMU_WAR_ENABLED: 'true', HARIMU_ARMY_MAP_ENABLED: 'true', HARIMU_ARMY_SUPPLY_ENABLED: 'true', HARIMU_ARMY_BATTLES_ENABLED: 'true', HARIMU_ARMY_DRILLS_ENABLED: 'true' };
const boot = await localRuntime({ backend: 'sqlite' });
const B = await boot.importModule('lib/army-battle.ts'); await boot.close();

test('rules: named constants; strength left carries over and recovers per game day up to full', () => {
  assert.deepEqual([B.BATTLE_LOSS_RECOVERY_PCT_PER_GAME_DAY, B.BATTLE_LOSS_GAME_DAY_SECONDS], [10, 7200]);
  const end = 1_000_000, day = B.BATTLE_LOSS_GAME_DAY_SECONDS;
  assert.equal(B.carriedStrength(10, 2, end, end), 2, 'right after the battle: what was left');
  assert.equal(B.carriedStrength(10, 2, end, end + day - 1), 2, 'only whole game days recover');
  assert.equal(B.carriedStrength(10, 2, end, end + 3 * day), 5);
  assert.equal(B.carriedStrength(10, 2, end, end + 100 * day), 10, 'never above full strength');
  assert.equal(B.carriedStrength(10, 2, end, end - day), 2, 'clock skew never adds strength');
});

const war = (r, id, mob) => r.db.prepare("INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,casus_belli,declared_by,declared_at,mobilization_ends_at) VALUES (?,?,'kindle:korund','kindle','korund','','AI',?,?)").bind(id, `r-${id}`, mob - 172800, mob).run();
const joinKorund = (r, requestId) => r.db.prepare("INSERT INTO army_members (clerk_user_id, unit_id, stance, joined_at, request_id) SELECT clerk_user_id, 'korund-home-guard', 'hold', 0, ? FROM citizens WHERE clerk_user_id NOT IN (SELECT clerk_user_id FROM army_members) LIMIT 1").bind(requestId).run();

for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: a unit that lost on the last tick is weaker on this tick; it recovers per game day; capitals unchanged`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close()); await r.call('citizen', 'alice');
    for (const [k, v] of Object.entries(ON)) r.setFixtureEnv(k, v);
    assert.equal((await r.call('army', 'alice', { action: 'join', unitId: 'kindle-home-guard', requestId: 'loss-738-join1' })).status, 200);
    await r.call('citizen', 'bob'); await joinKorund(r, 'loss-738-k1'); await r.call('citizen', 'carol'); await joinKorund(r, 'loss-738-k2');
    const now = Math.floor(r.now / 1000);
    await war(r, 'wl1', now - 30 * 86400);
    const owners = async () => (await r.db.prepare("SELECT owner FROM world_squares WHERE feature = 'capital' ORDER BY x").all()).results;
    const before = await owners();
    assert.equal((await r.call('world', null)).status, 200, 'the world tick records the finished battle');
    const [row] = (await r.db.prepare('SELECT * FROM army_battles').all()).results;
    assert.equal(row.status, 'defender_won', 'one supply-cut Kindle soldier against two fortified Korund soldiers');
    assert.deepEqual(await owners(), before, 'QA1: recording a battle never changes a capital owner');
    const full = 10, left = Number(row.attacker_strength), endedAt = Number(row.started_at) + Number(row.rounds) * B.BATTLE_ROUND_SECONDS;
    assert.ok(left < full, 'the battle cost strength');
    assert.equal(await B.withBattleLosses(r.db, 'kindle-home-guard', full, endedAt), left, 'the next tick starts from what was left');
    assert.ok(await B.withBattleLosses(r.db, 'kindle-home-guard', full, endedAt + 2 * B.BATTLE_LOSS_GAME_DAY_SECONDS) > left, 'recovering');
    assert.equal(await B.withBattleLosses(r.db, 'kindle-home-guard', full, endedAt + 100 * B.BATTLE_LOSS_GAME_DAY_SECONDS), full, 'fully recovered');
    assert.equal(await B.withBattleLosses(r.db, 'aurelle-home-guard', 7, now), 7, 'a unit with no battle keeps its strength');
  });

  test(`${backend}: the card shows the carried strength between battles; GET never writes; flag off: no change`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close()); await r.call('citizen', 'alice');
    for (const [k, v] of Object.entries(ON)) r.setFixtureEnv(k, v);
    assert.equal((await r.call('army', 'alice', { action: 'join', unitId: 'kindle-home-guard', requestId: 'loss-738-join2' })).status, 200);
    const fresh = (await r.call('army', 'alice')).data.army.unit.strength;
    const now = Math.floor(r.now / 1000), started = now - B.BATTLE_MAX_ROUNDS * B.BATTLE_ROUND_SECONDS - 60;
    // A battle that ended a minute ago (its war is over), as the world tick stores it.
    await r.db.prepare("INSERT INTO army_battles (battle_key, war_id, attacker_unit, defender_unit, started_at, rounds, status, retreated, attacker_strength, defender_strength, recorded_at) VALUES (?, 'old', 'kindle-home-guard', 'korund-home-guard', ?, ?, 'defender_won', 'attacker', 2, 9, ?)")
      .bind(`old:kindle-home-guard:${started}`, started, B.BATTLE_MAX_ROUNDS, now).run();
    const prepare = r.db.prepare.bind(r.db), sql = []; r.db.prepare = q => { sql.push(q); return prepare(q); };
    const card = (await r.call('army', 'alice')).data.army.unit; r.db.prepare = prepare;
    assert.equal(fresh, 10); assert.equal(card.strength, 2, 'weaker after the loss'); assert.equal(card.battle, undefined);
    assert.deepEqual(sql.filter(q => /^\s*(INSERT|UPDATE|DELETE)/i.test(q)), [], 'GET never writes');
    r.setFixtureEnv('HARIMU_ARMY_BATTLES_ENABLED', 'false');
    assert.equal((await r.call('army', 'alice')).data.army.unit.strength, 10, 'flag off: strength unchanged');
  });
}
