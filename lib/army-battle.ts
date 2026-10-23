/** #738 battles slice (docs §15.3 Resolution: battles resolve server-side in rounds every 10 real minutes from strength, terrain/fortification,
 *  supply and morale, with AI commanders deciding retreat). ARC rulings: a battle starts when an attacking unit is staged next to the defender's
 *  capital; deterministic, from current strength (which includes the #897 supply loss); every number a named constant; the capital is never
 *  captured. ARC on #910: a finished battle is stored once by the world tick (migration 0091 mirrors armyBattleSchemas); GETs read the stored row and derive only a
 *  running battle. Behind HARIMU_ARMY_BATTLES_ENABLED (needs HARIMU_ARMY_SUPPLY_ENABLED and its flags). */
import type { GameDatabase } from './database-contract';
import { armyUnits, unitForNation } from './army-rules';
import { marchArrivalAt, readActiveWars, unitMarch, type ArmyWar } from './army-map';
import { applySupplyLoss, armySupplyEnabled, PERCENT, unitSupply } from './army-supply';
import { readUnitReadiness } from './army';

export const armyBattlesEnabled = (env: unknown) => armySupplyEnabled(env) && (env as { HARIMU_ARMY_BATTLES_ENABLED?: string } | null)?.HARIMU_ARMY_BATTLES_ENABLED === 'true';
/** Docs §15.3: a round every 10 real minutes. */
export const BATTLE_ROUND_SECONDS = 600;
/** [ASSUMPTION] Tuning values (the docs give none). */
export const BATTLE_MAX_ROUNDS = 6;              // after this many rounds the side with more of its starting strength left wins
export const BATTLE_DAMAGE_PCT = 20;             // each round a side hits for this share of its morale-weighted strength
export const BATTLE_FORTIFICATION_BONUS_PCT = 25; // the defender fights from its fortified capital (terrain/fortification)
export const BATTLE_RETREAT_BELOW_PCT = 50;      // an AI commander retreats when its unit falls below this share of its starting strength

export type Side = { strength: number; morale: number };
export type BattleResult = { rounds: number; attackerStrength: number; defenderStrength: number; status: 'ongoing' | 'attacker_won' | 'defender_won'; retreated: 'attacker' | 'defender' | null };
const hit = (s: Side, bonusPct = 0) => Math.floor(s.strength * s.morale * BATTLE_DAMAGE_PCT * (PERCENT + bonusPct) / (PERCENT * PERCENT * PERCENT));
const broken = (now: number, start: number) => now === 0 || now * PERCENT < start * BATTLE_RETREAT_BELOW_PCT;
/** Pure and deterministic: plays `roundsElapsed` rounds (at most BATTLE_MAX_ROUNDS). Both sides hit at once each round. If both break in the same
 *  round the attacker retreats (ties go to the defender). The capital is never captured: an attacker win only costs the defender strength. */
export function resolveBattle(attacker: Side, defender: Side, roundsElapsed: number): BattleResult {
  let a = attacker.strength, d = defender.strength;
  const done = (rounds: number, status: BattleResult['status'], retreated: BattleResult['retreated']) => ({ rounds, attackerStrength: a, defenderStrength: d, status, retreated });
  if (broken(a, attacker.strength)) return done(0, 'defender_won', 'attacker');
  if (broken(d, defender.strength)) return done(0, 'attacker_won', 'defender');
  const rounds = Math.max(0, Math.min(BATTLE_MAX_ROUNDS, Math.floor(roundsElapsed)));
  for (let r = 1; r <= rounds; r++) {
    const toDefender = hit({ strength: a, morale: attacker.morale }), toAttacker = hit({ strength: d, morale: defender.morale }, BATTLE_FORTIFICATION_BONUS_PCT);
    a = Math.max(0, a - toAttacker); d = Math.max(0, d - toDefender);
    if (broken(a, attacker.strength)) return done(r, 'defender_won', 'attacker');
    if (broken(d, defender.strength)) return done(r, 'attacker_won', 'defender');
  }
  if (rounds < BATTLE_MAX_ROUNDS) return done(rounds, 'ongoing', null);
  return done(rounds, a * defender.strength > d * attacker.strength ? 'attacker_won' : 'defender_won', null);
}
/** Rounds played by `now`: the first round resolves BATTLE_ROUND_SECONDS after the unit is staged. */
export const roundsAt = (stagedAt: number, now: number) => Math.max(0, Math.floor((now - stagedAt) / BATTLE_ROUND_SECONDS));

export const armyBattleSchemas = [
  `CREATE TABLE IF NOT EXISTS army_battles (
 battle_key TEXT PRIMARY KEY,
 war_id TEXT NOT NULL,
 attacker_unit TEXT NOT NULL,
 defender_unit TEXT NOT NULL,
 started_at INTEGER NOT NULL,
 rounds INTEGER NOT NULL CHECK(rounds >= 0),
 status TEXT NOT NULL CHECK(status IN ('attacker_won','defender_won')),
 retreated TEXT CHECK(retreated IN ('attacker','defender')),
 attacker_strength INTEGER NOT NULL CHECK(attacker_strength >= 0),
 defender_strength INTEGER NOT NULL CHECK(defender_strength >= 0),
 recorded_at INTEGER NOT NULL
)`,
];
/** One battle per war, attacking unit and staging arrival (ARC on #910). */
export const battleKey = (warId: string, attackerUnit: string, startedAt: number) => `${warId}:${attackerUnit}:${startedAt}`;
export type Battle = BattleResult & { attackerNationId: string; defenderNationId: string; startedAt: number; stored: boolean };
type StoredRow = { battle_key: string; rounds: number; status: 'attacker_won' | 'defender_won'; retreated: 'attacker' | 'defender' | null; attacker_strength: number; defender_strength: number };
/** The battles at `now` for every staged attacking unit: the stored result once decided (never changes), else derived from current strength and morale.
 *  One read for stored rows; current strength is read only for battles not yet stored. Never writes. */
export async function readBattles(db: GameDatabase, wars: readonly ArmyWar[], now: number): Promise<(Battle & { key: string; attackerUnit: string; defenderUnit: string; warId: string })[]> {
  const staged = armyUnits.flatMap(unit => {
    const march = unitMarch(unit.nationId, wars, now), defender = march ? unitForNation(march.war.defender_nation) : null;
    if (!march || !defender || !march.war.id) return [];
    const startedAt = marchArrivalAt(march);
    return now < startedAt ? [] : [{ unit, defender, startedAt, warId: march.war.id, key: battleKey(march.war.id, unit.id, startedAt) }];
  });
  if (!staged.length) return [];
  const stored = new Map(((await db.prepare(`SELECT battle_key, rounds, status, retreated, attacker_strength, defender_strength FROM army_battles WHERE battle_key IN (${staged.map(() => '?').join(',')})`)
    .bind(...staged.map(s => s.key)).all<StoredRow>()).results ?? []).map(r => [r.battle_key, r]));
  return Promise.all(staged.map(async s => {
    const base = { attackerNationId: s.unit.nationId, defenderNationId: s.defender.nationId, startedAt: s.startedAt, key: s.key, attackerUnit: s.unit.id, defenderUnit: s.defender.id, warId: s.warId };
    const row = stored.get(s.key);
    if (row) return { ...base, stored: true, rounds: Number(row.rounds), status: row.status, retreated: row.retreated ?? null, attackerStrength: Number(row.attacker_strength), defenderStrength: Number(row.defender_strength) };
    const [att, def] = await Promise.all([readUnitReadiness(db, s.unit.id, now), readUnitReadiness(db, s.defender.id, now)]);
    const attacker = { strength: applySupplyLoss(att.strength, unitSupply(s.unit.nationId, wars, now).strengthLossPct), morale: att.morale };
    return { ...base, stored: false, ...resolveBattle(attacker, def, roundsAt(s.startedAt, now)) };
  }));
}
/** World tick (write path, behind the flag): store every finished, not yet stored battle once. INSERT ... ON CONFLICT DO NOTHING on the battle key, so
 *  concurrent ticks store exactly one row and a later strength change never alters it. */
export async function recordFinishedBattles(db: GameDatabase, now: number) {
  const done = (await readBattles(db, await readActiveWars(db), now)).filter(b => !b.stored && b.status !== 'ongoing');
  if (!done.length) return;
  await db.batch(done.map(b => db.prepare(`INSERT INTO army_battles (battle_key, war_id, attacker_unit, defender_unit, started_at, rounds, status, retreated, attacker_strength, defender_strength, recorded_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT (battle_key) DO NOTHING`).bind(b.key, b.warId, b.attackerUnit, b.defenderUnit, b.startedAt, b.rounds, b.status, b.retreated, b.attackerStrength, b.defenderStrength, now)));
}
