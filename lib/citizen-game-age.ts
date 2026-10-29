/** #1042, docs §17.2: how long the signed-in citizen has lived, in game years. Display only.
 *  One game year is four seasons on seasonAt's integer clock (30 real days). Days use the same 12× compression as the world clock.
 *  [ASSUMPTION] the card's "days" are game days (0–359). A real-day remainder cannot be 41, and the issue sample is "3 years, 41 days". */
import { gameTimeCompression } from './game-time.ts';
import { gameYearAt, seasonLengthSeconds } from './season-yield.ts';

/** Real seconds in one game day, from the season length and 12×. Integer (7200). */
export const citizenGameDaySeconds = (2 * seasonLengthSeconds) / (15 * gameTimeCompression);
/** Game days in one year: four seasons. Integer (360). */
export const citizenYearGameDays = (4 * seasonLengthSeconds) / citizenGameDaySeconds;

/** #1042: build flag NEXT_PUBLIC_HARIMU_CITIZEN_GAME_AGE ("true" in preview, "false" in production). */
export const citizenGameAgeEnabled = (value: string | undefined = process.env.NEXT_PUBLIC_HARIMU_CITIZEN_GAME_AGE) => value === 'true';

export type CitizenGameAge = { years: number; days: number; joinedYear: number };
type Clock = { epochSeconds?: number | null; nowSeconds?: number | null } | null | undefined;

/** Years and days lived, and the game year of the join. Null when the clock or the join instant is missing. Never substitutes epoch 0. */
export function citizenGameAge(clock: Clock, joinedAtMs: number | null | undefined): CitizenGameAge | null {
  if (!Number.isInteger(citizenGameDaySeconds) || !Number.isInteger(citizenYearGameDays) || citizenYearGameDays <= 0) return null;
  if (!clock || typeof clock.nowSeconds !== 'number' || !Number.isInteger(clock.nowSeconds)) return null;
  if (typeof joinedAtMs !== 'number' || !Number.isFinite(joinedAtMs)) return null;
  const joinedSeconds = Math.floor(joinedAtMs / 1000);
  if (!Number.isSafeInteger(joinedSeconds) || joinedSeconds > clock.nowSeconds) return null;
  const joinedYear = gameYearAt({ epochSeconds: clock.epochSeconds, nowSeconds: joinedSeconds });
  if (joinedYear === null) return null;
  const livedDays = Math.floor((clock.nowSeconds - joinedSeconds) / citizenGameDaySeconds);
  if (!Number.isSafeInteger(livedDays) || livedDays < 0) return null;
  return { years: Math.floor(livedDays / citizenYearGameDays), days: livedDays % citizenYearGameDays, joinedYear };
}

/** [ASSUMPTION] "1 year" / "1 day" when the count is one. The issue sample uses the plural. Both units are always shown, including zero. */
export function formatCitizenGameAge(age: CitizenGameAge): string {
  const years = `${age.years} ${age.years === 1 ? 'year' : 'years'}`;
  const days = `${age.days} ${age.days === 1 ? 'day' : 'days'}`;
  return `Age in game: ${years}, ${days} (joined game year ${age.joinedYear})`;
}
