import type { GameDatabase } from './database-contract';
import { isMissingRelation, tolerate } from './db-errors';
import { warNations, warWearinessUnrest, warWeeksAtWar, wearinessLevel, type WarNationId, type WearinessLevelId } from './war-rules';

/** #423: war weariness behind HARIMU_WAR_ENABLED and HARIMU_WAR_WEARINESS_ENABLED (both default "false"). Docs 15.3. Rules and numbers: lib/war-rules.ts.
 *  Nothing is stored for it: the Unrest a war has added is a pure function of the `wars` table and the time, so reads never write, a replayed tick gives the same
 *  answer, and the amount only steps up at each game-week boundary. The daily score (lib/stability.ts, written by the world tick) records it with the rest of Unrest. */
export type WearinessBindings = { HARIMU_WAR_ENABLED?: string; HARIMU_WAR_WEARINESS_ENABLED?: string };
/** Both flags must be on; either off means no scoring term, no state and no UI. */
export const wearinessEnabled = (bindings: WearinessBindings) => bindings.HARIMU_WAR_ENABLED === 'true' && bindings.HARIMU_WAR_WEARINESS_ENABLED === 'true';

type Row = { attacker_nation: WarNationId; defender_nation: WarNationId; mobilization_ends_at: number; ended_at: number | null };
/** Unrest added per nation as of `asOf` (epoch seconds), summed over every war the nation is in that is active at that time. Casualties and lost squares are not tracked yet, so they are zero.
 *  One read-only SELECT; a database without the wars table reads as none. */
export async function readWarWeariness(db: GameDatabase, asOf: number): Promise<Record<WarNationId, number>> {
  const out = Object.fromEntries(warNations.map(nation => [nation, 0])) as Record<WarNationId, number>;
  const rows = await db.prepare('SELECT attacker_nation,defender_nation,mobilization_ends_at,ended_at FROM wars WHERE mobilization_ends_at<=? AND (ended_at IS NULL OR ended_at>?)')
    .bind(asOf, asOf).all<Row>().catch(tolerate(isMissingRelation, { results: [] as Row[] }));
  const weeks = Object.fromEntries(warNations.map(nation => [nation, 0])) as Record<WarNationId, number>;
  for (const row of rows.results) {
    const w = warWeeksAtWar({ mobilizationEndsAt: Number(row.mobilization_ends_at), endedAt: row.ended_at === null ? null : Number(row.ended_at) }, asOf);
    if (warNations.includes(row.attacker_nation)) weeks[row.attacker_nation] += w;
    if (warNations.includes(row.defender_nation)) weeks[row.defender_nation] += w;
  }
  for (const nation of warNations) out[nation] = warWearinessUnrest(nation, weeks[nation]);
  return out;
}
/** What citizens may see: a level name per nation at war with weariness (never the amount, so Korund's true Unrest cannot be read off it). */
export type PublicWeariness = Partial<Record<WarNationId, WearinessLevelId>>;
export async function readPublicWeariness(db: GameDatabase, asOf: number): Promise<PublicWeariness> {
  const points = await readWarWeariness(db, asOf);
  const out: PublicWeariness = {};
  for (const nation of warNations) { const level = wearinessLevel(points[nation]); if (level) out[nation] = level; }
  return out;
}
