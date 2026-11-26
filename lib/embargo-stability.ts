import type { GameDatabase } from './database-contract';
import { isMissingRelation } from './db-errors';

/** #1526: in-force embargo counts as of `at` (imposed_at ≤ at, and lifted_at is null or > at). Missing embargoes returns null so the Stability step adds no term. Read-only; does not write embargoes or import the #1511 write path. */
const inForceSql = 'SELECT actor_nation,target_nation FROM embargoes WHERE imposed_at<=? AND (lifted_at IS NULL OR lifted_at>?)';
const nations = ['kindle', 'korund', 'aurelle'] as const;
export type EmbargoStabilityNation = typeof nations[number];
export type EmbargoStabilityCounts = { embargoesAgainstUs: number; embargoesWeImpose: number };
export type EmbargoStabilityMap = Record<EmbargoStabilityNation, EmbargoStabilityCounts>;

const isNation = (value: string): value is EmbargoStabilityNation => (nations as readonly string[]).includes(value);
const empty = (): EmbargoStabilityMap => Object.fromEntries(nations.map((id) => [id, { embargoesAgainstUs: 0, embargoesWeImpose: 0 }])) as EmbargoStabilityMap;

export async function readEmbargoStabilityAt(db: GameDatabase, at: number): Promise<EmbargoStabilityMap | null> {
  try {
    const rows = (await db.prepare(inForceSql).bind(at, at).all<{ actor_nation: string; target_nation: string }>()).results ?? [];
    const counts = empty();
    for (const row of rows) {
      if (isNation(row.target_nation)) counts[row.target_nation].embargoesAgainstUs += 1;
      if (isNation(row.actor_nation)) counts[row.actor_nation].embargoesWeImpose += 1;
    }
    return counts;
  } catch (error) {
    if (isMissingRelation(error)) return null;
    throw error;
  }
}
