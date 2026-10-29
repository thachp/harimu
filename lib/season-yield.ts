/** #1033, docs §17.1: game season scales farming-shift output (the farming jobs in lib/mvp-job-types.ts).
 *  Flag HARIMU_SEASON_FARMING_ENABLED, inside HARIMU_GRAY_PACK. A direct string still wins. Off: callers keep today's output. */
import { flagOn } from './flag-pack.mjs';
import { seasonLabels, seasonOrder, type GameSeason } from './game-season.ts';
import { jobTypeOf } from './mvp-job-types.ts';

export const seasonFarmingEnabled = (env: object | null | undefined) => flagOn(env, 'HARIMU_SEASON_FARMING_ENABLED');
export const isFarmingShift = (jobId: string) => jobTypeOf(jobId) === 'farming';

/** [ASSUMPTION] integer percents of base units until ARC picks others: spring 100, summer 110, autumn 120, winter 70. */
export const seasonYieldPercents: Record<GameSeason, number> = { spring: 100, summer: 110, autumn: 120, winter: 70 };

/** Integer units: floor(base × percent / 100), never below 1. A base of 4 floors summer and autumn back to 4; winter is 2.
 *  A base of 0 or less is returned unchanged so a season cannot mint food from nothing. */
export function seasonYieldUnits(base: number, season: GameSeason): number {
  const pct = seasonYieldPercents[season];
  return base <= 0 ? base : Math.max(1, Math.floor(base * pct / 100));
}

/** [ASSUMPTION] result-line copy. The minus is U+2212, matching the wallet. Spring is "+0%". Percent is pct − 100. */
export function seasonEffectLine(season: GameSeason): string {
  const delta = seasonYieldPercents[season] - 100;
  return `${seasonLabels[season]}: ${delta < 0 ? '−' : '+'}${Math.abs(delta)}% harvest`;
}

const seasonMark = / · ([A-Z][a-z]+: [+\u2212]\d+% harvest)$/;
/** 7.5 real days, in integer seconds. Not a 7.5 float. */
const seasonLengthSeconds = (15 * 86_400) / 2;

/** The season for a world clock `{ epochSeconds, nowSeconds }`, both integers. Null when there is no clock.
 *  A missing clock is not epoch 0. Callers treat null as no season effect. */
export function seasonAt(clock: { epochSeconds?: number | null; nowSeconds?: number | null } | null | undefined): GameSeason | null {
  if (!clock) return null;
  const epoch = clock.epochSeconds, now = clock.nowSeconds;
  if (typeof epoch !== 'number' || typeof now !== 'number' || !Number.isInteger(epoch) || !Number.isInteger(now)) return null;
  const index = Math.floor(Math.max(0, now - epoch) / seasonLengthSeconds);
  return seasonOrder[index % 4];
}

/** Null season: the caller keeps the original output and unit count. */
export function farmingShiftYield(output: string, baseUnits: number, season: GameSeason | null): { output: string; units: number } | null {
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
