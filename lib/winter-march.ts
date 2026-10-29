/** #1038, docs §17.1: winter slows campaigning. Reuses gameSeasonAt from #1023. No new clock. */
import { gameSeasonAt } from './game-season';
import { formatDuration, gameTimeCompression } from './game-time';
import { flagOn } from './flag-pack.mjs';

/** [ASSUMPTION] Winter roads multiply march time by 1.5. The docs name the effect and not the number. */
export const WINTER_MARCH_MULTIPLIER = 1.5;
export const WINTER_ROADS = 'Winter roads: marches take longer';
export type MarchPace = { epochSeconds: number; enabled: true };
/** Inside HARIMU_ARMY_PACK. Read with flagOn so a direct string still wins. */
export const winterMarchEnabled = (env: unknown) => flagOn(env, 'HARIMU_WINTER_MARCH_ENABLED');

/** Multiplier locked to the season at march start. Flag off, or any season but winter, is 1. A later season turn does not change it. */
export function marchTimeFactor(epochSeconds: number, startSeconds: number, enabled: boolean): number {
  if (!enabled || !Number.isFinite(epochSeconds) || !Number.isFinite(startSeconds)) return 1;
  return gameSeasonAt(epochSeconds * 1000, startSeconds * 1000)?.season === 'winter' ? WINTER_MARCH_MULTIPLIER : 1;
}
/** Remaining march time in real time and game time (docs §23.2). */
export function winterMarchTime(remainingSeconds: number): string {
  const ms = Math.max(0, Number.isFinite(remainingSeconds) ? remainingSeconds : 0) * 1000;
  return `${formatDuration(ms)} real time; ${formatDuration(ms * gameTimeCompression)} game time.`;
}
export const winterMarchConfirmation = (remainingSeconds: number) => `${WINTER_ROADS}. ${winterMarchTime(remainingSeconds)}`;
