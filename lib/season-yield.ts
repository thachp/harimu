/** #1033, docs §17.1: game season scales farming-shift output (the farming jobs in lib/mvp-job-types.ts).
 *  Flag HARIMU_SEASON_FARMING_ENABLED, inside HARIMU_GRAY_PACK. A direct string still wins. Off: callers keep today's output. */
import type { GameDatabase } from './database-contract.ts';
import { flagOn } from './flag-pack.mjs';
import { gameSeasonAt, seasonLabels, type GameSeason } from './game-season.ts';
import { jobTypeOf } from './mvp-job-types.ts';

export const seasonFarmingEnabled = (env: object | null | undefined) => flagOn(env, 'HARIMU_SEASON_FARMING_ENABLED');
export const isFarmingShift = (jobId: string) => jobTypeOf(jobId) === 'farming';

/** [ASSUMPTION] multipliers until ARC picks others: spring 1, summer 1.1, autumn 1.2, winter 0.7. */
export const seasonYieldMultipliers: Record<GameSeason, number> = { spring: 1, summer: 1.1, autumn: 1.2, winter: 0.7 };

/** Integer units, rounded down, never below 1. A base of 4 floors summer and autumn back to 4; winter is 2. */
export function seasonYieldUnits(baseUnits: number, season: GameSeason): number {
  return Math.max(1, Math.floor(baseUnits * seasonYieldMultipliers[season]));
}

/** [ASSUMPTION] result-line copy. The minus is U+2212, matching the wallet. Spring is "+0%". */
export function seasonEffectLine(season: GameSeason): string {
  const delta = Math.round((seasonYieldMultipliers[season] - 1) * 100);
  return `${seasonLabels[season]}: ${delta < 0 ? '−' : '+'}${Math.abs(delta)}% harvest`;
}

const seasonMark = / · ([A-Z][a-z]+: [+\u2212]\d+% harvest)$/;

/** Season at `atMs` from the world clock epoch the HUD uses. Null when the clock or the instant is missing. */
export async function farmingSeasonAt(db: GameDatabase, atMs: number): Promise<GameSeason | null> {
  if (!Number.isFinite(atMs)) return null;
  const row = await db.prepare("SELECT epoch_seconds FROM world_clock WHERE id='main'").first<{ epoch_seconds: number }>();
  return row ? gameSeasonAt(Number(row.epoch_seconds) * 1000, atMs)?.season ?? null : null;
}

/** Null when the flag is off or the clock has no season: the caller keeps the original output and unit count. */
export async function farmingShiftYield(db: GameDatabase, output: string, baseUnits: number, atMs: number, enabled: boolean): Promise<{ output: string; units: number } | null> {
  if (!enabled) return null;
  const season = await farmingSeasonAt(db, atMs);
  if (!season) return null;
  const units = seasonYieldUnits(baseUnits, season);
  // Only a sentence that begins with the unit count is rewritten. Kindle's "480 food…" line is flavor and stays.
  const text = units === baseUnits ? output : output.replace(new RegExp(`^${baseUnits}(?=\\s)`), String(units));
  return { output: `${text} · ${seasonEffectLine(season)}`, units };
}

export const leadingFoodUnits = (output: string, fallback = 4) => {
  const match = /^(\d+) food\b/.exec(output);
  return match ? Number(match[1]) : fallback;
};

/** Food count to bind instead of the literal 4, or null to keep the shipped settle SQL. A line with no season mark pays today's 4. */
export function storedFoodUnits(output: string, baseUnits: number): number | null {
  if (!seasonMark.test(output)) return null;
  const units = leadingFoodUnits(output, baseUnits);
  return units === baseUnits ? null : units;
}
