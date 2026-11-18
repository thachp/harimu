/** #1491: the attacker's staging square adds its terrain to the defender's battle bonus (docs §15.3). No migration.
 *  Flag HARIMU_BATTLE_TERRAIN_ENABLED, assigned GRAY 98 (index 97, after #1490). The pack is dense and #1490 is not on dev,
 *  so indexOf stays 96 until HARIMU_TRADE_RENEWAL_ENABLED is inserted ahead of this flag. Needs army battles. Flag off: the response and the card stay byte-identical. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { localRuntime } from './helpers/local-runtime.mjs';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import { unitMembership } from '../lib/army-copy.ts';

const FLAG = 'HARIMU_BATTLE_TERRAIN_ENABLED';
const FOG = 'HARIMU_KORUND_MAP_FOG_ENABLED';
const ON = { HARIMU_ARMIES_ENABLED: 'true', HARIMU_WAR_ENABLED: 'true', HARIMU_ARMY_MAP_ENABLED: 'true', HARIMU_ARMY_SUPPLY_ENABLED: 'true', HARIMU_ARMY_BATTLES_ENABLED: 'true', HARIMU_ARMY_DRILLS_ENABLED: 'true' };
const boot = await localRuntime({ backend: 'sqlite' });
const B = await boot.importModule('lib/army-battle.ts'), M = await boot.importModule('lib/army-map.ts');
await boot.close();

const side = { strength: 100, morale: 100 };
const today = { rounds: 1, attackerStrength: 75, defenderStrength: 80, status: 'ongoing', retreated: null };

test('terrain tiers, a 35% maximum, bonus 0 matches today, hills beats plains, and a tie goes to the defender', () => {
  const table = { plains: 0, city: 0, 'river edge': 5, forest: 5, wetland: 5, hills: 10, 'old-growth forest': 10, mountains: 10 };
  assert.deepEqual(B.BATTLE_TERRAIN_BONUS_PCT, table);
  for (const [terrain, pct] of Object.entries(table)) assert.equal(B.battleTerrainBonusPct(terrain), pct, terrain);
  for (const terrain of [undefined, '', 'volcanic badland', 'cliff/plateau']) assert.equal(B.battleTerrainBonusPct(terrain), 0, String(terrain));
  assert.equal(B.BATTLE_FORTIFICATION_BONUS_PCT + Math.max(...Object.values(table)), 35);
  assert.equal(B.battleTerrainEnabled({ ...ON, [FLAG]: 'true' }), true);
  assert.equal(B.battleTerrainEnabled(ON), false, 'unset means off');
  assert.equal(B.battleTerrainEnabled({ ...ON, HARIMU_ARMY_BATTLES_ENABLED: 'false', [FLAG]: 'true' }), false, 'needs army battles');
  assert.deepEqual(B.stagingSquare({ home: { x: 1, y: 2 }, route: [] }), { x: 1, y: 2 });
  assert.deepEqual(B.stagingSquare({ home: { x: 1, y: 2 }, route: [{ x: 3, y: 4 }, { x: 5, y: 6 }] }), { x: 5, y: 6 });
  assert.deepEqual(B.resolveBattle(side, side, 1), today);
  assert.deepEqual(B.resolveBattle(side, side, 1, 0), today);
  assert.deepEqual(B.resolveBattle(side, side, 6, 0), B.resolveBattle(side, side, 6));
  const plains = B.resolveBattle(side, side, 1, B.battleTerrainBonusPct('plains'));
  const hills = B.resolveBattle(side, side, 1, B.battleTerrainBonusPct('hills'));
  assert.deepEqual(plains, today);
  assert.deepEqual(hills, B.resolveBattle(side, side, 1, 10));
  assert.ok(hills.attackerStrength < plains.attackerStrength, 'hills: the defender deals more damage');
  assert.equal(hills.defenderStrength, plains.defenderStrength);
  assert.equal(hills.attackerStrength, 73, '25% fortification plus 10% terrain is a 35% hit');
  assert.deepEqual(hills, B.resolveBattle(side, side, 1, B.battleTerrainBonusPct('mountains')));
  const tie = B.resolveBattle({ strength: 1, morale: 1 }, { strength: 1, morale: 1 }, B.BATTLE_MAX_ROUNDS, B.battleTerrainBonusPct('hills'));
  assert.deepEqual([tie.rounds, tie.attackerStrength, tie.defenderStrength, tie.status, tie.retreated], [6, 1, 1, 'defender_won', null]);
  assert.equal(unitMembership.battleGround.proposal, true);
  assert.equal(unitMembership.battleGround.text, 'Ground: {terrain} (defenders +{pct}%)');
  assert.match(readFileSync('lib/army-copy.ts', 'utf8'), /PLACEHOLDER copy, marked for Content[^\n]*#1491[^\n]*\n battleGround:L\(/);
  assert.match(readFileSync('app/army-card.tsx', 'utf8'), /\{unit\.battle\?\.terrain && <p>\{battleGroundLine\(unit\.battle\)\}<\/p>\}/);
});

test('the flag is preview true, production false, assigned GRAY 98, dense index 96 until #1490, and listed in previewOnFlags', () => {
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf('HARIMU_AURELLE_BROADSHEETS_ENABLED'), 95);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf(FLAG), 96, 'no hole: index 97 once #1490 takes GRAY 97');
  const preview = JSON.parse(readFileSync('wrangler.jsonc', 'utf8').replace(/^\s*\/\/.*$/gm, ''));
  const prod = JSON.parse(readFileSync('wrangler.prod.jsonc', 'utf8').replace(/^\s*\/\/.*$/gm, ''));
  assert.equal(preview.vars[FLAG], undefined);
  assert.equal(prod.vars[FLAG], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[FLAG], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[FLAG], 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).indexOf(FLAG), 96);
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).indexOf(FLAG), 96);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, FLAG), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, FLAG), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [FLAG]: 'false' }, FLAG), false);
  assert.match(readFileSync('tests/wrangler-prod-501b.test.mjs', 'utf8'), /'HARIMU_BATTLE_TERRAIN_ENABLED'/);
});

const kindleBattle = data => data.battles.find(b => b.attackerNationId === 'kindle');
async function spy(r, fn) {
  const prepare = r.db.prepare.bind(r.db), seen = { sql: [] };
  r.db.prepare = q => { seen.sql.push(q); return prepare(q); };
  try { seen.result = await fn(); } finally { r.db.prepare = prepare; }
  return seen;
}

test('flag off is byte-identical, flag on carries the staging square, a stored battle stays stored, and Korund fog still filters', async t => {
  const r = await localRuntime({ backend: 'sqlite' }); t.after(() => r.close());
  await r.call('citizen', 'alice');
  for (const [k, v] of Object.entries(ON)) r.setFixtureEnv(k, v);
  r.setFixtureEnv(FLAG, 'true'); r.setFixtureEnv('HARIMU_ARMY_BATTLES_ENABLED', 'false');
  assert.equal((await r.call('army/battles', null)).status, 404, 'terrain does not open battles by itself');
  r.setFixtureEnv('HARIMU_ARMY_BATTLES_ENABLED', 'true'); r.setFixtureEnv(FLAG, undefined);
  assert.equal((await r.call('army', 'alice', { action: 'join', unitId: 'kindle-home-guard', requestId: 'battle-1491-join' })).status, 200);
  const at = new Date(r.now).toISOString();
  for (let i = 0; i < 9; i++) {
    await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,?,?,18,0,'Good standing',?,?)").bind(`a${i}`, 'kindle', `a${i}`, at, at).run();
    await r.db.prepare("INSERT INTO army_members (clerk_user_id, unit_id, stance, joined_at, request_id) VALUES (?,?,?,?,?)").bind(`a${i}`, 'kindle-home-guard', 'hold', 0, `a-req-${i}`).run();
  }
  for (let i = 0; i < 10; i++) {
    await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,?,?,18,0,'Good standing',?,?)").bind(`k${i}`, 'korund', `k${i}`, at, at).run();
    await r.db.prepare("INSERT INTO army_members (clerk_user_id, unit_id, stance, joined_at, request_id) VALUES (?,?,?,?,?)").bind(`k${i}`, 'korund-home-guard', 'hold', 0, `k-req-${i}`).run();
  }
  const now = Math.floor(r.now / 1000);
  const probe = M.unitMarch('kindle', [{ id: 'w1491', attacker_nation: 'kindle', defender_nation: 'korund', mobilization_ends_at: 0, declared_at: 0 }], 1);
  const mob = now - M.marchArrivalAt(probe) - B.BATTLE_ROUND_SECONDS;
  await r.db.prepare("INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,casus_belli,declared_by,declared_at,mobilization_ends_at) VALUES ('w1491','r-1491','kindle:korund','kindle','korund','','AI',?,?)").bind(mob - 172800, mob).run();
  const square = B.stagingSquare(probe), terrain = M.terrainMap().get(`${square.x},${square.y}`);
  assert.equal(terrain, 'hills');

  const off = await r.call('army/battles', null);
  const cardOff = await r.call('army', 'alice');
  r.setFixtureEnv(FLAG, 'false');
  const offFalse = await r.call('army/battles', null);
  const cardFalse = await r.call('army', 'alice');
  assert.equal(JSON.stringify(offFalse.data), JSON.stringify(off.data), 'flag false matches flag unset');
  assert.equal(JSON.stringify(cardFalse.data.army.unit.battle), JSON.stringify(cardOff.data.army.unit.battle));
  assert.equal(off.cache, 'private, no-store');
  const offRead = await r.importModule('lib/army-battle.ts'), offMap = await r.importModule('lib/army-map.ts');
  const derivedOff = (await offRead.readBattles(r.db, await offMap.readActiveWars(r.db), now)).find(b => b.attackerNationId === 'kindle');
  assert.equal(Object.hasOwn(derivedOff, 'terrain'), false, 'flag off: readBattles adds no terrain');
  assert.equal(Object.hasOwn(derivedOff, 'terrainBonusPct'), false, 'flag off: readBattles adds no terrainBonusPct');
  for (const battle of offFalse.data.battles) {
    assert.equal(Object.hasOwn(battle, 'terrain'), false, 'flag off: the API adds no terrain key');
    assert.equal(Object.hasOwn(battle, 'terrainBonusPct'), false);
  }
  assert.equal(Object.hasOwn(cardFalse.data.army.unit.battle, 'terrain'), false, 'flag off: the card line is absent');
  assert.equal(Object.hasOwn(cardFalse.data.army.unit.battle, 'terrainBonusPct'), false);

  r.setFixtureEnv(FLAG, 'true');
  const read = await spy(r, () => r.call('army/battles', null));
  const live = kindleBattle(read.result.data);
  const card = (await r.call('army', 'alice')).data.army.unit.battle;
  assert.equal(read.result.cache, 'private, no-store');
  assert.deepEqual(read.sql.filter(q => /^\s*(INSERT|UPDATE|DELETE)/i.test(q)), [], 'GET never writes');
  assert.equal(live.stored, false);
  assert.equal(live.terrain, 'hills');
  assert.equal(live.terrainBonusPct, 10);
  assert.ok(live.attackerStrength < kindleBattle(off.data).attackerStrength, `${live.attackerStrength} vs ${kindleBattle(off.data).attackerStrength}`);
  assert.equal(live.defenderStrength, kindleBattle(off.data).defenderStrength);
  assert.deepEqual(await r.call('army/battles', null).then(x => x.data), read.result.data, 'deterministic');
  assert.equal(card.terrain, 'hills');
  assert.equal(card.terrainBonusPct, 10);
  assert.equal(unitMembership.battleGround.text.replace('{terrain}', card.terrain).replace('{pct}', String(card.terrainBonusPct)), 'Ground: hills (defenders +10%)');

  await r.db.prepare("INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,casus_belli,declared_by,declared_at,mobilization_ends_at) VALUES ('w1491b','r-1491b','aurelle:kindle','aurelle','kindle','','AI',?,?)").bind(mob - 172800, mob).run();
  r.setFixtureEnv(FOG, 'true');
  const full = await r.call('army/battles', 'alice');
  const fog = await r.call('army/battles', 'k0');
  assert.equal(fog.cache, 'private, no-store');
  assert.deepEqual(full.data.battles.map(b => b.defenderNationId).sort(), ['kindle', 'korund']);
  assert.deepEqual(fog.data.battles.map(b => b.defenderNationId), ['korund']);
  assert.equal(fog.data.battles[0].terrain, 'hills');
  assert.ok(full.data.battles.some(b => b.defenderNationId === 'kindle' && b.terrain === 'volcanic badland' && b.terrainBonusPct === 0));
  r.setFixtureEnv(FOG, 'false');
  await r.db.prepare("DELETE FROM wars WHERE id='w1491b'").run();

  const AB = await r.importModule('lib/army-battle.ts'), Map = await r.importModule('lib/army-map.ts');
  await r.db.prepare('UPDATE wars SET declared_at = declared_at - ?, mobilization_ends_at = mobilization_ends_at - ? WHERE id=?').bind(B.BATTLE_ROUND_SECONDS * 5, B.BATTLE_ROUND_SECONDS * 5, 'w1491').run();
  const wars = await Map.readActiveWars(r.db);
  const plain = (await AB.readBattles(r.db, wars, now)).find(b => b.attackerNationId === 'kindle');
  const terr = (await AB.readBattles(r.db, wars, now, null, { terrain: true })).find(b => b.attackerNationId === 'kindle');
  assert.notEqual(plain.status, 'ongoing');
  assert.notEqual(terr.attackerStrength, plain.attackerStrength);
  await AB.recordFinishedBattles(r.db, now, false, true);
  assert.equal(Number((await r.db.prepare('SELECT attacker_strength AS n FROM army_battles').first()).n), terr.attackerStrength, 'the tick stores the terrain-adjusted result');
  const adjusted = (await AB.readBattles(r.db, wars, now, null, { terrain: true })).find(b => b.attackerNationId === 'kindle');
  assert.equal(adjusted.stored, true);
  assert.equal(Object.hasOwn(adjusted, 'terrain'), false);
  assert.equal(adjusted.attackerStrength, terr.attackerStrength);
  await r.db.prepare('DELETE FROM army_battles').run();
  r.setFixtureEnv(FLAG, 'false');
  await AB.recordFinishedBattles(r.db, now);
  const row = (await r.db.prepare('SELECT * FROM army_battles').all()).results;
  assert.equal(row.length, 1);
  assert.equal(Number(row[0].attacker_strength), plain.attackerStrength);
  const storedOff = kindleBattle((await r.call('army/battles', null)).data);
  const cardStoredOff = JSON.stringify((await r.call('army', 'alice')).data.army.unit.battle);
  r.setFixtureEnv(FLAG, 'true');
  const storedOn = kindleBattle((await r.call('army/battles', null)).data);
  const cardStoredOn = JSON.stringify((await r.call('army', 'alice')).data.army.unit.battle);
  assert.equal(JSON.stringify(storedOn), JSON.stringify(storedOff));
  assert.equal(cardStoredOn, cardStoredOff);
  assert.equal(storedOn.stored, true);
  assert.equal(storedOn.attackerStrength, plain.attackerStrength);
  assert.notEqual(storedOn.attackerStrength, terr.attackerStrength);
  assert.equal(Object.hasOwn(storedOn, 'terrain'), false);
  assert.equal(Object.hasOwn(storedOn, 'terrainBonusPct'), false);
  assert.equal(cardStoredOn.includes('terrain'), false);
  const rowOn = (await r.db.prepare('SELECT * FROM army_battles').all()).results;
  assert.deepEqual(rowOn, row, 'a flag flip does not rewrite a stored battle');
  await AB.recordFinishedBattles(r.db, now, false, true);
  assert.deepEqual((await r.db.prepare('SELECT * FROM army_battles').all()).results, row, 'a later tick does not re-resolve a stored row');
});
