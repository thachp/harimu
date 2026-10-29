/** #1052 (docs §15.3 Resolution): squad stances shape a running battle. Counts only, named-constant modifiers inside ±10% at a
 *  unanimous unit, one army-card line, deterministic, stored battles unchanged. Behind HARIMU_ARMY_BATTLES_ENABLED. SQLite + PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { localRuntime } from './helpers/local-runtime.mjs';

const ON = { HARIMU_ARMIES_ENABLED: 'true', HARIMU_WAR_ENABLED: 'true', HARIMU_ARMY_MAP_ENABLED: 'true', HARIMU_ARMY_SUPPLY_ENABLED: 'true', HARIMU_ARMY_BATTLES_ENABLED: 'true', HARIMU_ARMY_DRILLS_ENABLED: 'true' };
const boot = await localRuntime({ backend: 'sqlite' });
const B = await boot.importModule('lib/army-battle.ts'); await boot.close();
const mix = (hold, advance, fall_back) => ({ hold, advance, fall_back });
const side = (stances) => ({ strength: 100, morale: 100, ...(stances ? { stances } : {}) });

test('advance versus hold differs, stays inside the named bound, and a unit with no members resolves as before', () => {
  assert.ok(B.BATTLE_STANCE_ADVANCE_PCT > 0 && B.BATTLE_STANCE_ADVANCE_PCT <= 10, 'advance is a named constant, at most +10');
  assert.ok(B.BATTLE_STANCE_FALL_BACK_PCT < 0 && B.BATTLE_STANCE_FALL_BACK_PCT >= -10, 'fall_back is a named constant, at most -10');
  assert.equal(B.stanceShiftPct(mix(0, 8, 0)), B.BATTLE_STANCE_ADVANCE_PCT, 'unanimous advance');
  assert.equal(B.stanceShiftPct(mix(0, 0, 8)), B.BATTLE_STANCE_FALL_BACK_PCT, 'unanimous fall_back');
  assert.equal(B.stanceShiftPct(mix(8, 0, 0)), 0, 'hold is neutral');
  assert.equal(B.stanceShiftPct(undefined), 0);
  assert.equal(B.stanceShiftPct(mix(0, 0, 0)), 0, 'no members');
  const half = B.stanceShiftPct(mix(2, 2, 0));
  assert.ok(half > 0 && half < B.BATTLE_STANCE_ADVANCE_PCT, 'a mix stays inside the unanimous bound');
  const today = B.resolveBattle(side(), side(), 1);
  assert.deepEqual(today, { rounds: 1, attackerStrength: 75, defenderStrength: 80, status: 'ongoing', retreated: null }, 'the pre-stance round');
  assert.deepEqual(B.resolveBattle(side(mix(0, 0, 0)), side(mix(0, 0, 0)), 1), today, 'a no-member unit behaves as today');
  assert.deepEqual(B.resolveBattle(side(mix(4, 0, 0)), side(mix(4, 0, 0)), 1), today, 'all hold is neutral');
  const empty = B.resolveBattle({ strength: 0, morale: 50, stances: mix(0, 0, 0) }, side(), 5);
  assert.deepEqual(empty, B.resolveBattle({ strength: 0, morale: 50 }, side(), 5));
  const advance = B.resolveBattle(side(mix(0, 4, 0)), side(mix(4, 0, 0)), 1);
  assert.deepEqual(advance, B.resolveBattle(side(mix(0, 4, 0)), side(mix(4, 0, 0)), 1), 'deterministic');
  assert.notDeepEqual(advance, today);
  assert.ok(advance.attackerStrength < today.attackerStrength, 'advance takes more damage');
  assert.ok(advance.defenderStrength < today.defenderStrength, 'advance deals more damage');
  const dealt = (r) => 100 - r.defenderStrength, taken = (r) => 100 - r.attackerStrength;
  assert.ok(dealt(today) > 0 && (dealt(advance) - dealt(today)) * 100 <= dealt(today) * B.BATTLE_STANCE_ADVANCE_PCT, 'damage dealt stays inside the bound');
  assert.ok(taken(today) > 0 && (taken(advance) - taken(today)) * 100 <= taken(today) * B.BATTLE_STANCE_ADVANCE_PCT, 'damage taken stays inside the bound');
  const back = B.resolveBattle(side(mix(0, 0, 4)), side(mix(4, 0, 0)), 1);
  assert.ok(back.attackerStrength > today.attackerStrength && back.defenderStrength > today.defenderStrength, 'fall_back lowers damage dealt and taken');
  const src = readFileSync('lib/army-battle.ts', 'utf8');
  assert.doesNotMatch(src, /HARIMU_[A-Z0-9_]*STANCE/, 'no new flag');
  const counts = src.split('export async function readUnitStances')[1];
  assert.equal(counts, undefined, 'the aggregate lives beside readiness, not in the battle module');
  const query = readFileSync('lib/army.ts', 'utf8').split('export async function readUnitStances')[1].split('\n}')[0];
  assert.match(query, /COUNT\(CASE WHEN stance/); assert.doesNotMatch(query, /clerk_user_id/);
});

test('the army card shows one stance-mix line during a battle, counts only, from army-copy', async () => {
  const { unitMembership } = await import('../lib/army-copy.ts');
  const src = readFileSync('app/army-card.tsx', 'utf8');
  assert.match(src, /\{unit\.battle\?\.stances && <p>\{stanceMixLine\(unit\.battle\.stances\)\}<\/p>\}/);
  assert.doesNotMatch(src, /clerk_user_id|display_name/);
  const text = unitMembership.battleStances.text;
  assert.equal(unitMembership.battleStances.proposal, true);
  assert.ok(text.length <= 100, text);
  assert.doesNotMatch(text, /\d|!/);
  assert.match(readFileSync('lib/army-copy.ts', 'utf8'), /PLACEHOLDER copy, marked for Content[^\n]*#1052[^\n]*\n battleStances:L\(/);
  const ts = (await import('typescript')).default, { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const js = ts.transpileModule(src, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  new Function('exports', 'require', 'module', js)(mod.exports, n => n === './session-retry' ? { SessionRetry() { return null; }, okOr5xx: r => r, useLoadRetry: () => ({ fail() {}, retry() {}, failed: false, attempt: 0 }) } : n.startsWith('@/lib/') ? require(`../lib/${n.slice(6)}.ts`) : require(n), mod);
  const line = mod.exports.stanceMixLine({ hold: 2, advance: 3, fall_back: 4 });
  assert.equal(line, text.replace('{hold}', '2').replace('{advance}', '3').replace('{fall_back}', '4'));
  assert.equal(line, 'Squads: 2 holding, 3 advancing, 4 falling back.');
  assert.doesNotMatch(line, /clerk|user_/);
  const { Window } = await import('happy-dom');
  const w = new Window({ url: 'http://localhost/' }); globalThis.window = w; globalThis.document = w.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const React = require('react'), { createRoot } = require('react-dom/client'), { act } = React;
  const army = { unit: { id: 'kindle-home-guard', name: 'Kindle Home Guard', officer: 'Captain Arden', memberCount: 9, openToVolunteers: true, strength: 100, morale: 50, battle: { opponentNationId: 'korund', attacking: true, rounds: 1, status: 'ongoing', stances: { hold: 2, advance: 3, fall_back: 4 } } }, member: true, stance: 'hold' };
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ army }) });
  const el = document.createElement('div'); document.body.appendChild(el); const root = createRoot(el);
  const show = key => act(async () => { root.render(React.createElement('div', null, React.createElement(mod.exports.ArmyCard, { key }))); await new Promise(r => setTimeout(r, 0)); });
  await show('a'); assert.match(el.textContent, /Squads: 2 holding, 3 advancing, 4 falling back\./); assert.doesNotMatch(el.textContent, /clerk|user_/);
  army.unit = { ...army.unit, battle: { opponentNationId: 'korund', attacking: true, rounds: 1, status: 'attacker_won' } };
  await show('b'); assert.doesNotMatch(el.textContent, /Squads:/, 'a finished battle has no live mix'); assert.match(el.textContent, /Battle with Korund/);
  await act(async () => root.unmount());
});

async function spy(r, fn) { const prepare = r.db.prepare.bind(r.db), seen = { sql: [] }; r.db.prepare = q => { seen.sql.push(q); return prepare(q); }; try { seen.result = await fn(); } finally { r.db.prepare = prepare; } return seen; }
const seed = async (r, nation, unit, n) => { for (let i = 0; i < n; i++) { const id = `m1052-${nation}-${i}`;
  await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,?,?,18,0,'Good standing','2026-01-15T12:00:00Z','2026-01-15T12:00:00Z')").bind(id, nation, id).run();
  await r.db.prepare('INSERT INTO army_members (clerk_user_id, unit_id, stance, joined_at, request_id) VALUES (?,?,?,?,?)').bind(id, unit, 'hold', 0, `rq-${id}`).run(); } };

for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: the stance mix changes a running battle inside the bound; a stored battle does not; the API shows counts only`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close()); await r.call('citizen', 'alice');
    for (const [k, v] of Object.entries(ON)) r.setFixtureEnv(k, v);
    assert.equal((await r.call('army', 'alice', { action: 'join', unitId: 'kindle-home-guard', requestId: 'stance-1052-join' })).status, 200);
    await seed(r, 'kindle', 'kindle-home-guard', 29); await seed(r, 'korund', 'korund-home-guard', 30);
    const now = Math.floor(r.now / 1000), AB = await r.importModule('lib/army-battle.ts'), Map = await r.importModule('lib/army-map.ts'), A = await r.importModule('lib/army.ts'), S = await r.importModule('lib/army-supply.ts');
    const probe = Map.unitMarch('kindle', [{ attacker_nation: 'kindle', defender_nation: 'korund', mobilization_ends_at: 0, declared_at: 0 }], 1);
    const mob = now - Map.marchArrivalAt(probe) - AB.BATTLE_ROUND_SECONDS;
    await r.db.prepare("INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,casus_belli,declared_by,declared_at,mobilization_ends_at) VALUES ('ws','r-1052','kindle:korund','kindle','korund','','AI',?,?)").bind(mob - 172800, mob).run();
    const wars = await Map.readActiveWars(r.db);
    const holdCounts = await A.readUnitStances(r.db, 'kindle-home-guard'), defCounts = await A.readUnitStances(r.db, 'korund-home-guard');
    assert.deepEqual(holdCounts, { hold: 30, advance: 0, fall_back: 0 }); assert.deepEqual(defCounts, { hold: 30, advance: 0, fall_back: 0 });
    const holdBattle = (await AB.readBattles(r.db, wars, now))[0];
    assert.equal(holdBattle.status, 'ongoing'); assert.equal(holdBattle.rounds, 1); assert.deepEqual(holdBattle.stances.attacker, holdCounts);
    await r.db.prepare("UPDATE army_members SET stance = 'advance' WHERE unit_id = 'kindle-home-guard'").run();
    const advanced = (await AB.readBattles(r.db, wars, now))[0];
    assert.deepEqual(advanced, (await AB.readBattles(r.db, wars, now))[0], 'deterministic');
    assert.deepEqual(advanced.stances.attacker, { hold: 0, advance: 30, fall_back: 0 });
    assert.ok(advanced.defenderStrength < holdBattle.defenderStrength, 'all-advance deals more than all-hold');
    assert.ok(advanced.attackerStrength < holdBattle.attackerStrength, 'all-advance takes more than all-hold');
    const att = await A.readUnitReadiness(r.db, 'kindle-home-guard', now), def = await A.readUnitReadiness(r.db, 'korund-home-guard', now);
    const attStr = S.applySupplyLoss(att.strength, S.unitSupply('kindle', wars, now).strengthLossPct);
    const pure = AB.resolveBattle({ strength: attStr, morale: att.morale, stances: advanced.stances.attacker }, { strength: def.strength, morale: def.morale, stances: defCounts }, 1);
    assert.deepEqual([advanced.attackerStrength, advanced.defenderStrength], [pure.attackerStrength, pure.defenderStrength], 'the running battle uses the counts');
    const dealtHold = def.strength - holdBattle.defenderStrength, dealtAdv = def.strength - advanced.defenderStrength;
    const takenHold = attStr - holdBattle.attackerStrength, takenAdv = attStr - advanced.attackerStrength;
    assert.ok(dealtHold > 0 && (dealtAdv - dealtHold) * 100 <= dealtHold * AB.BATTLE_STANCE_ADVANCE_PCT);
    assert.ok(takenHold > 0 && (takenAdv - takenHold) * 100 <= takenHold * AB.BATTLE_STANCE_ADVANCE_PCT);
    const card = (await r.call('army', 'alice')).data, battles = (await r.call('army/battles', null)).data;
    assert.deepEqual(card.army.unit.battle.stances, advanced.stances.attacker, 'the card gets the viewer unit only');
    assert.deepEqual(battles.battles[0].stances, advanced.stances);
    const blob = JSON.stringify({ card, battles });
    const ids = (await r.db.prepare('SELECT clerk_user_id FROM army_members').all()).results.map(x => x.clerk_user_id);
    for (const id of ids) assert.equal(blob.includes(id), false, id);
    assert.equal(blob.includes('clerk_user_id'), false);
    for (const counts of [card.army.unit.battle.stances, battles.battles[0].stances.attacker, battles.battles[0].stances.defender]) {
      assert.deepEqual(Object.keys(counts).sort(), ['advance', 'fall_back', 'hold']);
      for (const n of Object.values(counts)) assert.equal(typeof n, 'number');
    }
    const later = now + AB.BATTLE_MAX_ROUNDS * AB.BATTLE_ROUND_SECONDS;
    await AB.recordFinishedBattles(r.db, later);
    const rows = (await r.db.prepare('SELECT * FROM army_battles').all()).results;
    assert.equal(rows.length, 1, 'the finished battle is stored once');
    await r.db.prepare("UPDATE army_members SET stance = 'fall_back'").run();
    await AB.recordFinishedBattles(r.db, later + 60);
    assert.deepEqual((await r.db.prepare('SELECT * FROM army_battles').all()).results, rows, 'a stored row does not change when stances change');
    const stored = (await AB.readBattles(r.db, wars, later + 60))[0];
    assert.equal(stored.stored, true); assert.equal(stored.stances, undefined);
    assert.equal(stored.attackerStrength, Number(rows[0].attacker_strength)); assert.equal(stored.defenderStrength, Number(rows[0].defender_strength));
    assert.equal(stored.status, rows[0].status); assert.equal(stored.rounds, Number(rows[0].rounds));
    assert.deepEqual(await AB.readBattles(r.db, wars, later + 60), [stored], 're-reading a finished battle returns the same result');
    r.setFixtureEnv('HARIMU_ARMY_BATTLES_ENABLED', 'false');
    const off = await spy(r, () => r.call('army', 'alice'));
    assert.equal(off.result.data.army.unit.battle, undefined, 'flag off: no battle and no stance mix');
    assert.ok(!off.sql.some(q => q.includes("stance = 'hold'")), 'flag off: stance counts are not read');
    assert.equal((await r.call('army/battles', null)).status, 404);
  });
}
