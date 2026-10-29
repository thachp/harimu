/** #1041, docs §17.2: the world Age. Display only. An Age starts at the world clock's game epoch.
 *  [ASSUMPTION] an Age lasts AGE_GAME_YEARS game years. One game year is the 30-real-day season cycle
 *  (12× compression: 360 game days, about one real month), so 12 game years is about 12 real months. */
import { flagOn } from './flag-pack.mjs';
import { gameTimerSnapshot } from './game-time.ts';

export const AGE_GAME_YEARS = 12;
export const ageYearMs = 30 * 86_400_000;
export const ageLengthMs = AGE_GAME_YEARS * ageYearMs;

/** HARIMU_WORLD_AGES_ENABLED lives in HARIMU_UI_PACK, not its own text binding. The client build copies the
 *  packed value onto NEXT_PUBLIC_HARIMU_WORLD_AGES_ENABLED so Next (and the shell bundlers) inline this one read.
 *  A direct string still wins when a caller passes env. */
export const worldAgesEnabled = (env?: unknown) => flagOn(
  env ?? { HARIMU_WORLD_AGES_ENABLED: process.env.NEXT_PUBLIC_HARIMU_WORLD_AGES_ENABLED },
  'HARIMU_WORLD_AGES_ENABLED',
);

export type WorldAge = { age: number; year: number; startsAt: number; endsAt: number; remainingMs: number };

/** Age 1, year 1 begins at `epochMs`. Before the epoch it is still that first year. Null when a clock value is not finite. */
export function worldAgeAt(epochMs: number, nowMs: number): WorldAge | null {
  if (!Number.isFinite(epochMs) || !Number.isFinite(nowMs)) return null;
  const elapsed = Math.max(0, nowMs - epochMs);
  const ageIndex = Math.floor(elapsed / ageLengthMs);
  const yearIndex = Math.floor((elapsed - ageIndex * ageLengthMs) / ageYearMs);
  const startsAt = epochMs + ageIndex * ageLengthMs, endsAt = startsAt + ageLengthMs;
  return { age: ageIndex + 1, year: yearIndex + 1, startsAt, endsAt, remainingMs: endsAt - Math.max(nowMs, epochMs) };
}

/** Visible HUD line. Year is 1..AGE_GAME_YEARS inside the current Age. */
export const ageHudLine = (age: Pick<WorldAge, 'age' | 'year'>) => `Age ${age.age}, year ${age.year} of ${AGE_GAME_YEARS}`;

/** Tooltip: real time and game time to the next Age, the same pair the #29 timer shows (`Nd real · Nd game`). */
export function ageRemainingTip(endsAt: number, nowMs: number): string {
  const snap = gameTimerSnapshot(endsAt, nowMs);
  if (snap.status === 'expired') return 'The next Age has begun · refresh to confirm.';
  if (snap.status !== 'running') return snap.real;
  return `Next Age in ${snap.real} real · ${snap.game} game`;
}
