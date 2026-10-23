/** #738 battles slice (docs §15.3 Resolution: battles resolve server-side in rounds every 10 real minutes from strength, terrain/fortification,
 *  supply and morale, with AI commanders deciding retreat). ARC rulings: a battle starts when an attacking unit is staged next to the defender's
 *  capital; deterministic, from current strength (which includes the #897 supply loss); every number a named constant; the capital is never
 *  captured. Derived on read (no table, no writes). Behind HARIMU_ARMY_BATTLES_ENABLED (needs HARIMU_ARMY_SUPPLY_ENABLED and its flags). */
import type { GameDatabase } from './database-contract';
import { armyUnits, unitForNation } from './army-rules';
import { marchArrivalAt, unitMarch, type ArmyWar } from './army-map';
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

export type Battle = BattleResult & { attackerNationId: string; defenderNationId: string; startedAt: number };
/** The battles at `now` for every staged attacking unit. Reads current strength and morale of both units; GET only, never writes. */
export async function readBattles(db: GameDatabase, wars: readonly ArmyWar[], now: number): Promise<Battle[]> {
  const battles: Battle[] = [];
  for (const unit of armyUnits) {
    const march = unitMarch(unit.nationId, wars, now), defenderUnit = march ? unitForNation(march.war.defender_nation) : null;
    if (!march || !defenderUnit) continue;
    const startedAt = marchArrivalAt(march); if (now < startedAt) continue;
    const [att, def] = await Promise.all([readUnitReadiness(db, unit.id, now), readUnitReadiness(db, defenderUnit.id, now)]);
    const attacker = { strength: applySupplyLoss(att.strength, unitSupply(unit.nationId, wars, now).strengthLossPct), morale: att.morale };
    battles.push({ attackerNationId: unit.nationId, defenderNationId: defenderUnit.nationId, startedAt, ...resolveBattle(attacker, def, roundsAt(startedAt, now)) });
  }
  return battles;
}
