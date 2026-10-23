/** #887 (Part of #738): simple army supply (docs §15.3 Logistics: units need supply lines from depots; cut lines reduce strength each game day).
 *  Derived on read from the slice-4 march; flag HARIMU_ARMY_SUPPLY_ENABLED on top of the army-map flags. SQLite + PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { localRuntime } from './helpers/local-runtime.mjs';

const MAP = { HARIMU_ARMIES_ENABLED: 'true', HARIMU_WAR_ENABLED: 'true', HARIMU_ARMY_MAP_ENABLED: 'true' }, ON = { ...MAP, HARIMU_ARMY_SUPPLY_ENABLED: 'true' };
const boot = await localRuntime({ backend: 'sqlite' });
const S = await boot.importModule('lib/army-supply.ts'), M = await boot.importModule('lib/army-map.ts'); await boot.close();
const DAY = 7200;

test('rules: flag chain (unset means off), named constants, cut time, daily loss with cap, strength floor', () => {
  assert.equal(S.armySupplyEnabled(ON), true); assert.equal(S.armySupplyEnabled(MAP), false, 'unset supply flag means off');
  for (const k of Object.keys(ON)) assert.equal(S.armySupplyEnabled({ ...ON, [k]: 'false' }), false, k); assert.equal(S.armySupplyEnabled(null), false);
  assert.deepEqual([S.ARMY_SUPPLY_RANGE_SQUARES, S.ARMY_SUPPLY_LOSS_PCT_PER_DAY, S.ARMY_SUPPLY_LOSS_CAP_PCT, S.ARMY_SUPPLY_GAME_DAY_SECONDS], [5, 10, 50, DAY]);
  const route = Array.from({ length: 8 }, (_, i) => ({ x: i + 1, y: 0 })), plains = () => 'plains';
  assert.equal(S.supplyCutAt({ x: 0, y: 0 }, route.slice(0, 5), 100, plains), null, 'never beyond range: never cut');
  assert.equal(S.supplyCutAt({ x: 0, y: 0 }, route, 100, plains), 100 + 6 * M.ARMY_MOVE_SECONDS_FAST, 'cut on entering the 6th square');
  assert.deepEqual(S.supplyState(null, 1e9), { cut: false, cutDays: 0, strengthLossPct: 0 }); assert.deepEqual(S.supplyState(1000, 999), { cut: false, cutDays: 0, strengthLossPct: 0 });
  assert.deepEqual(S.supplyState(1000, 1000 + DAY - 1), { cut: true, cutDays: 0, strengthLossPct: 0 }, 'no loss before a full game day');
  assert.deepEqual(S.supplyState(1000, 1000 + DAY), { cut: true, cutDays: 1, strengthLossPct: 10 });
  assert.deepEqual(S.supplyState(1000, 1000 + 9 * DAY), { cut: true, cutDays: 9, strengthLossPct: 50 }, 'capped');
  assert.deepEqual([S.applySupplyLoss(10, 0), S.applySupplyLoss(10, 50), S.applySupplyLoss(13, 10), S.applySupplyLoss(-4, 10)], [10, 5, 11, 0]);
  const war = { attacker_nation: 'kindle', defender_nation: 'korund', declared_at: 0, mobilization_ends_at: 0 };
  assert.equal(S.unitSupply('kindle', [war], 10 ** 7).strengthLossPct, 50, 'a long march far from the depot'); assert.equal(S.unitSupply('korund', [war], 10 ** 7).cut, false, 'the defender at home');
  assert.equal(S.unitSupply('kindle', [], 10 ** 7).cut, false, 'war over: home and supplied');
});

test('card and legend: the cut line comes from army-copy (placeholder for Content)', () => {
  assert.match(readFileSync('app/army-card.tsx', 'utf8'), /\{unit\.supply\?\.cut && <p>\{supplyCutLine\(unit\.supply\)\}<\/p>\}/);
  assert.match(readFileSync('lib/army-copy.ts', 'utf8'), /PLACEHOLDER copy, marked for Content[^\n]*slice 5[^\n]*\n supplyCut:L\(/);
});

async function spy(r, fn) { const prepare = r.db.prepare.bind(r.db), seen = { sql: [] }; r.db.prepare = q => { seen.sql.push(q); return prepare(q); }; try { seen.result = await fn(); } finally { r.db.prepare = prepare; } return seen; }
for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: supply off adds no reads and no keys; on, a long march shows cut supply and halves the card strength; GET never writes`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close()); await r.call('citizen', 'alice');
    for (const [k, v] of Object.entries({ ...ON, HARIMU_ARMY_DRILLS_ENABLED: 'true' })) r.setFixtureEnv(k, v);
    assert.equal((await r.call('army', 'alice', { action: 'join', unitId: 'kindle-home-guard', requestId: 'supply-887-join' })).status, 200);
    const now = Math.floor(r.now / 1000), mob = now - 10 * 86400;
    await r.db.prepare("INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,casus_belli,declared_by,declared_at,mobilization_ends_at) VALUES ('w887','r-887-sup1','kindle:korund','kindle','korund','','AI',?,?)").bind(mob - 172800, mob).run();
    r.setFixtureEnv('HARIMU_ARMY_SUPPLY_ENABLED', undefined);
    const offMap = await spy(r, () => r.call('army/positions', null)), offCard = await spy(r, () => r.call('army', 'alice'));
    assert.equal(offMap.result.data.units.some(u => 'supply' in u), false); assert.equal('supply' in offCard.result.data.army.unit, false);
    r.setFixtureEnv('HARIMU_ARMY_SUPPLY_ENABLED', 'true');
    const onMap = await spy(r, () => r.call('army/positions', null)), onCard = await spy(r, () => r.call('army', 'alice'));
    assert.equal(onMap.sql.length, offMap.sql.length, 'the map reuses its one wars read'); assert.equal(onCard.sql.length, offCard.sql.length + 1, 'the card adds one wars read, only while on');
    for (const s of [onMap, onCard, offMap, offCard]) assert.deepEqual(s.sql.filter(q => /^\s*(INSERT|UPDATE|DELETE)/i.test(q)), [], 'never writes');
    const k = onMap.result.data.units.find(u => u.nationId === 'kindle');
    assert.deepEqual(k.supply, { cut: true, cutDays: k.supply.cutDays, strengthLossPct: 50 }); assert.ok(k.supply.cutDays >= 5);
    assert.equal(onMap.result.data.units.find(u => u.nationId === 'korund').supply.cut, false);
    assert.equal(offCard.result.data.army.unit.strength, 10); assert.equal(onCard.result.data.army.unit.strength, 5, 'one member (10) at the 50% cap');
    assert.equal(onCard.result.data.army.unit.supply.cut, true);
  });
}
