/** #738 battles slice (docs §15.3 Resolution: battles resolve server-side in rounds every 10 real minutes from strength, terrain/fortification,
 *  supply and morale, with AI commanders deciding retreat). ARC rulings: a battle starts when an attacking unit is staged next to the defender's
 *  capital; deterministic, from current strength (which includes the #897 supply loss); every number a named constant; the capital is never
 *  captured. ARC on #910: a finished battle is stored once by the world tick (migration 0096 mirrors armyBattleSchemas); GETs read the stored row and derive only a
 *  running battle. Behind HARIMU_ARMY_BATTLES_ENABLED (needs HARIMU_ARMY_SUPPLY_ENABLED and its flags). */
import type { GameDatabase } from './database-contract';
import { armyUnits, unitForNation } from './army-rules';
import { marchArrivalAt, readActiveWars, unitMarch, type ArmyWar } from './army-map';
import { applySupplyLoss, armySupplyEnabled, PERCENT, unitSupply } from './army-supply';
import { flagOn } from './flag-pack.mjs';
import { readUnitReadiness } from './army';
import { woundedUntil } from './army-wounds';
/** #934: battle square transfers use the same weekly-cap guard as siege captures. #910 does not capture; call `transferBattleSquares` when a path gains transfers. */
export { transferBattleSquares } from './war-loss-cap';

export const armyBattlesEnabled = (env: unknown) => armySupplyEnabled(env) && flagOn(env, 'HARIMU_ARMY_BATTLES_ENABLED');
/** Docs §15.3: a round every 10 real minutes. */
export const BATTLE_ROUND_SECONDS = 600;
/** [ASSUMPTION] Tuning values (the docs give none). */
export const BATTLE_MAX_ROUNDS = 6;              // after this many rounds the side with more of its starting strength left wins
export const BATTLE_DAMAGE_PCT = 20;             // each round a side hits for this share of its morale-weighted strength
export const BATTLE_FORTIFICATION_BONUS_PCT = 25; // the defender fights from its fortified capital (terrain/fortification)
/** #738 battle losses (ARC): a unit's last stored battle caps its strength at what it had left, recovering this share of its full strength per game
 *  day after the battle ended, until the cap reaches full strength. */
export const BATTLE_LOSS_RECOVERY_PCT_PER_GAME_DAY = 10;
export const BATTLE_LOSS_GAME_DAY_SECONDS = 7200; // one game day (two real hours), as in army-supply
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
    // #679: readiness and the carried-loss row are independent reads (the loss query does not use the readiness result).
    // They share one round trip; strength is applied after both return. A stored battle never starts these reads.
    const [att, def, attLoss, defLoss] = await Promise.all([
      readUnitReadiness(db, s.unit.id, now), readUnitReadiness(db, s.defender.id, now),
      lossRow(db, s.unit.id, now), lossRow(db, s.defender.id, now)]);
    // #738 battle losses: both sides start from the strength their last stored battle left them (recovering per game day).
    const attFull = applyCarriedLoss(s.unit.id, att.strength, attLoss, now), defFull = applyCarriedLoss(s.defender.id, def.strength, defLoss, now);
    const attacker = { strength: applySupplyLoss(attFull, unitSupply(s.unit.nationId, wars, now).strengthLossPct), morale: att.morale }, defender = { strength: defFull, morale: def.morale };
    return { ...base, stored: false, ...resolveBattle(attacker, defender, roundsAt(s.startedAt, now)) };
  }));
}
/** Pure: strength after carried losses. `left` is what the unit had at the end of its last stored battle; it recovers by
 *  BATTLE_LOSS_RECOVERY_PCT_PER_GAME_DAY of `full` per whole game day since `endedAt`, and never exceeds `full`. */
export function carriedStrength(full: number, left: number, endedAt: number, now: number) {
  const days = Math.max(0, Math.floor((now - endedAt) / BATTLE_LOSS_GAME_DAY_SECONDS));
  return Math.min(full, left + Math.floor(full * BATTLE_LOSS_RECOVERY_PCT_PER_GAME_DAY * days / PERCENT));
}
type LossRow = { attacker_unit: string; attacker_strength: number; defender_strength: number; started_at: number; rounds: number };
const lossRow = (db: GameDatabase, unitId: string, now: number) => db.prepare('SELECT attacker_unit, attacker_strength, defender_strength, started_at, rounds FROM army_battles WHERE (attacker_unit = ? OR defender_unit = ?) AND started_at <= ? ORDER BY started_at DESC LIMIT 1')
  .bind(unitId, unitId, now).first<LossRow>();
/** Pure: `full` after the latest stored battle, or `full` when that battle is missing. */
function applyCarriedLoss(unitId: string, full: number, last: LossRow | null, now: number) {
  if (!last) return full;
  const left = Number(last.attacker_unit === unitId ? last.attacker_strength : last.defender_strength);
  return carriedStrength(full, left, Number(last.started_at) + Number(last.rounds) * BATTLE_ROUND_SECONDS, now);
}
/** The unit's strength with losses from its latest stored battle (as attacker or defender) carried in. One read, never writes. */
export async function withBattleLosses(db: GameDatabase, unitId: string, full: number, now: number) {
  return applyCarriedLoss(unitId, full, await lossRow(db, unitId, now), now);
}
/** #911 (ARC on #944): the unit destroyed in a finished battle is the side that retreated broken; none after a round-limit decision. */
export const destroyedUnit = (b: { retreated: 'attacker' | 'defender' | null; attackerUnit: string; defenderUnit: string }) =>
  b.retreated === 'attacker' ? b.attackerUnit : b.retreated === 'defender' ? b.defenderUnit : null;
/** World tick (write path, behind the flag): store every finished, not yet stored battle once. INSERT ... ON CONFLICT DO NOTHING on the battle key, so
 *  concurrent ticks store exactly one row and a later strength change never alters it. */
export async function recordFinishedBattles(db: GameDatabase, now: number) {
  const done = (await readBattles(db, await readActiveWars(db), now)).filter(b => !b.stored && b.status !== 'ongoing');
  if (!done.length) return;
  // #911 (ARC on #944): only a unit that retreated broken is destroyed; its members are wounded (never killed), in the same batch; conditional too,
  // so a replay keeps the first times. A round-limit loss (retreated null) wounds no one.
  const losers = done.map(destroyedUnit), hit = losers.filter((u): u is string => !!u);
  const members = hit.length ? (await db.prepare(`SELECT clerk_user_id, unit_id FROM army_members WHERE unit_id IN (${hit.map(() => '?').join(',')})`).bind(...hit).all<{ clerk_user_id: string; unit_id: string }>()).results ?? [] : [];
  const wounds = done.flatMap((b, i) => members.filter(m => losers[i] && m.unit_id === losers[i]).map(m => db.prepare('INSERT INTO army_wounds (battle_key, clerk_user_id, wounded_until) VALUES (?,?,?) ON CONFLICT (battle_key, clerk_user_id) DO NOTHING')
    .bind(b.key, m.clerk_user_id, woundedUntil(b.key, m.clerk_user_id, b.startedAt + b.rounds * BATTLE_ROUND_SECONDS))));
  await db.batch([...done.map(b => db.prepare(`INSERT INTO army_battles (battle_key, war_id, attacker_unit, defender_unit, started_at, rounds, status, retreated, attacker_strength, defender_strength, recorded_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT (battle_key) DO NOTHING`).bind(b.key, b.warId, b.attackerUnit, b.defenderUnit, b.startedAt, b.rounds, b.status, b.retreated, b.attackerStrength, b.defenderStrength, now)), ...wounds]);
}
