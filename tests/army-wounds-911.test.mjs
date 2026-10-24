/** #911 (docs §15.4): soldiers of a unit that loses a stored battle are wounded, never killed: out of action 1–3 real days, deterministic from the
 *  battle key; no gear loss. Behind HARIMU_ARMY_BATTLES_ENABLED. SQLite + PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { localRuntime } from './helpers/local-runtime.mjs';

const ON = { HARIMU_ARMIES_ENABLED: 'true', HARIMU_WAR_ENABLED: 'true', HARIMU_ARMY_MAP_ENABLED: 'true', HARIMU_ARMY_SUPPLY_ENABLED: 'true', HARIMU_ARMY_BATTLES_ENABLED: 'true', HARIMU_ARMY_DRILLS_ENABLED: 'true' };
const boot = await localRuntime({ backend: 'sqlite' });
const W = await boot.importModule('lib/army-wounds.ts'), A = await boot.importModule('lib/army.ts'); await boot.close();

test('rules: named 1–3 day window; deterministic per battle and citizen; never deletes or updates', () => {
  assert.deepEqual([W.WOUNDED_MIN_SECONDS, W.WOUNDED_MAX_SECONDS], [86400, 259200]);
  for (let i = 0; i < 200; i++) { const d = W.woundedUntil(`w:${i}:7`, `u${i}`, 1000) - 1000; assert.ok(d >= 86400 && d <= 259200, String(d)); }
  assert.equal(W.woundedUntil('k', 'u', 5), W.woundedUntil('k', 'u', 5), 'same battle, same time');
  assert.notEqual(W.woundedUntil('k', 'u1', 5), W.woundedUntil('k', 'u2', 5), 'spread across soldiers');
  assert.doesNotMatch(readFileSync('lib/army-wounds.ts', 'utf8'), /DELETE|UPDATE/);
});

test('ARC on #944: only the side that retreated broken is destroyed; a round-limit loss (retreated null) wounds no one', async () => {
  const b = await localRuntime({ backend: 'sqlite' }); const AB = await b.importModule('lib/army-battle.ts'); await b.close();
  const base = { attackerUnit: 'kindle-home-guard', defenderUnit: 'korund-home-guard' };
  assert.equal(AB.destroyedUnit({ ...base, retreated: 'attacker' }), 'kindle-home-guard');
  assert.equal(AB.destroyedUnit({ ...base, retreated: 'defender' }), 'korund-home-guard');
  assert.equal(AB.destroyedUnit({ ...base, retreated: null }), null);
  const limit = AB.resolveBattle({ strength: 100, morale: 20 }, { strength: 100, morale: 20 }, AB.BATTLE_MAX_ROUNDS);
  assert.notEqual(limit.status, 'ongoing'); assert.equal(limit.retreated, null, 'a round-limit decision');
  assert.equal(AB.destroyedUnit({ ...base, ...limit }), null, 'so nobody is wounded');
});

const joinKorund = (r, requestId) => r.db.prepare("INSERT INTO army_members (clerk_user_id, unit_id, stance, joined_at, request_id) SELECT clerk_user_id, 'korund-home-guard', 'hold', 0, ? FROM citizens WHERE clerk_user_id NOT IN (SELECT clerk_user_id FROM army_members) LIMIT 1").bind(requestId).run();
const call = (r, user, body, path = 'army') => r.call(path, user, body);

for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: losing a battle wounds every member 1–3 days, once (replay keeps times); wounded cannot join, stance or drill; recovered can join; items untouched`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close()); await r.call('citizen', 'alice');
    for (const [k, v] of Object.entries(ON)) r.setFixtureEnv(k, v);
    assert.equal((await call(r, 'alice', { action: 'join', unitId: 'kindle-home-guard', requestId: 'wound-911-join1' })).status, 200);
    await r.call('citizen', 'bob'); await joinKorund(r, 'wound-911-k1'); await r.call('citizen', 'carol'); await joinKorund(r, 'wound-911-k2');
    const now = Math.floor(r.now / 1000), M = await r.importModule('lib/army-map.ts');
    const probe = mob => M.marchArrivalAt(M.unitMarch('kindle', [{ attacker_nation: 'kindle', defender_nation: 'korund', declared_at: mob - 172800, mobilization_ends_at: mob }], now));
    const travel = probe(now - 30 * 86400) - (now - 30 * 86400), mob = now - travel - 6 * 600 - 60; // the battle ended a minute ago, so the wounds are still running
    assert.equal(probe(mob), now - 6 * 600 - 60);
    await r.db.prepare("INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,casus_belli,declared_by,declared_at,mobilization_ends_at) VALUES ('ww','r-ww','kindle:korund','kindle','korund','','AI',?,?)").bind(mob - 172800, mob).run();
    const items = async () => (await r.db.prepare('SELECT * FROM market_items ORDER BY 1').all()).results;
    const itemsBefore = await items();
    const AB = await r.importModule('lib/army-battle.ts');
    await Promise.all([r.call('world', null), AB.recordFinishedBattles(r.db, now)]);
    const [battle] = (await r.db.prepare('SELECT * FROM army_battles').all()).results;
    assert.deepEqual([battle.status, battle.retreated], ['defender_won', 'attacker'], 'Kindle retreated broken (destroyed)');
    const wounds = (await r.db.prepare('SELECT battle_key, clerk_user_id, wounded_until FROM army_wounds ORDER BY clerk_user_id').all()).results;
    const kindle = (await r.db.prepare("SELECT clerk_user_id FROM army_members WHERE unit_id = 'kindle-home-guard'").all()).results.map(x => x.clerk_user_id);
    assert.deepEqual(wounds.map(w => w.clerk_user_id), kindle, 'every member of the losing unit, and only them');
    const endedAt = Number(battle.started_at) + Number(battle.rounds) * AB.BATTLE_ROUND_SECONDS, until = Number(wounds[0].wounded_until);
    assert.ok(until - endedAt >= 86400 && until - endedAt <= 259200); assert.equal(until, W.woundedUntil(battle.battle_key, kindle[0], endedAt), 'deterministic from the battle');
    await AB.recordFinishedBattles(r.db, now + 3600);
    assert.deepEqual((await r.db.prepare('SELECT battle_key, clerk_user_id, wounded_until FROM army_wounds ORDER BY clerk_user_id').all()).results, wounds, 'replay: same rows, same times');
    assert.deepEqual(await items(), itemsBefore, 'no gear loss');
    assert.ok((await r.db.prepare("SELECT 1 FROM citizens WHERE clerk_user_id = ?").bind(kindle[0]).first()), 'never killed');
    // Wounded: card line; stance and drill refused (409 wounded); leave allowed; join refused.
    const card = (await call(r, 'alice')).data.army; assert.equal(card.woundedUntil, until);
    for (const [body, path] of [[{ action: 'stance', stance: 'advance', requestId: 'wound-911-st1' }, 'army'], [{ requestId: 'wound-911-dr1' }, 'army/drill']]) {
      const res = await call(r, 'alice', body, path); assert.deepEqual([res.status, res.data.reason, res.data.woundedUntil], [409, 'wounded', until], path);
    }
    assert.equal((await call(r, 'alice', { action: 'leave', requestId: 'wound-911-leave' })).status, 200);
    const refused = await call(r, 'alice', { action: 'join', unitId: 'kindle-home-guard', requestId: 'wound-911-join2' });
    assert.deepEqual([refused.status, refused.data.reason], [409, 'wounded']); assert.match(refused.data.error, /wounded/);
    // After wounded_until: the read clears and joining works again.
    assert.equal(await W.readWoundedUntil(r.db, kindle[0], until), null);
    const later = await A.runArmyCommand(r.db, kindle[0], { action: 'join', unitId: 'kindle-home-guard', requestId: 'wound-911-join3' }, until + 1);
    assert.equal(later.ok, true, 'recovered soldiers can join again');
    r.setFixtureEnv('HARIMU_ARMY_BATTLES_ENABLED', 'false');
    assert.equal((await call(r, 'alice')).data.army.woundedUntil, undefined, 'flag off: no wounded state');
  });

  test(`${backend}: flag off: a wound row changes nothing (join and drill as before, no extra read)`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close()); await r.call('citizen', 'alice');
    for (const [k, v] of Object.entries({ ...ON, HARIMU_ARMY_BATTLES_ENABLED: 'false' })) r.setFixtureEnv(k, v);
    const id = (await r.db.prepare('SELECT clerk_user_id FROM citizens LIMIT 1').first()).clerk_user_id;
    await r.db.prepare("INSERT INTO army_wounds (battle_key, clerk_user_id, wounded_until) VALUES ('x', ?, ?)").bind(id, Math.floor(r.now / 1000) + 86400).run();
    const prepare = r.db.prepare.bind(r.db), sql = []; r.db.prepare = q => { sql.push(q); return prepare(q); };
    assert.equal((await call(r, 'alice', { action: 'join', unitId: 'kindle-home-guard', requestId: 'wound-911-off1' })).status, 200);
    assert.equal((await call(r, 'alice', { requestId: 'wound-911-off2' }, 'army/drill')).status, 200);
    r.db.prepare = prepare;
    assert.deepEqual(sql.filter(q => /army_wounds/.test(q)), [], 'no wound reads with the flag off');
  });
}
