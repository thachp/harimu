/** #1047, docs §17.3: a per-citizen soft cap on productive shifts started in the current real day.
 *  Flag HARIMU_SHIFT_SOFT_CAP_ENABLED, inside HARIMU_GRAY_PACK. A direct string still wins.
 *  Off: callers do not read the clock or the shift table. */
import type { GameDatabase } from './database-contract';
import { flagOn } from './flag-pack.mjs';
import { integerClock } from './season-yield.ts';

/** [ASSUMPTION] docs §17.3 example, pending ARC. */
export const DAILY_SHIFT_SOFT_CAP = 3;
/** One real day, in integer seconds. The same length as 12 world ticks (tickSeconds 7200). */
export const SHIFT_DAY_SECONDS = 86_400;

export const shiftSoftCapEnabled = (env: object | null | undefined) => flagOn(env, 'HARIMU_SHIFT_SOFT_CAP_ENABLED');

export type ShiftDay = { started: number; cap: number; resetsAt: string };
export type ShiftDayWindow = { start: number; resetsAt: number };

/** The real day holding `nowSeconds`, measured from the world-clock epoch. Null when there is no clock.
 *  A missing clock is not epoch 0, so the cap does not apply. */
export function shiftDayAt(clock: { epochSeconds?: number | null; nowSeconds?: number | null } | null | undefined): ShiftDayWindow | null {
  const tick = integerClock(clock);
  if (!tick) return null;
  const index = Math.floor(Math.max(0, tick.nowSeconds - tick.epochSeconds) / SHIFT_DAY_SECONDS);
  const start = tick.epochSeconds + index * SHIFT_DAY_SECONDS;
  return { start, resetsAt: start + SHIFT_DAY_SECONDS };
}

export const shiftCapRefusal = `You've worked your ${DAILY_SHIFT_SOFT_CAP} shifts today. Come back after the daily tick.`;

/** [ASSUMPTION] the reset sentence. The count line is the issue's "Shifts today: N of 3". */
export function shiftsTodayLine(day: Pick<ShiftDay, 'started' | 'cap' | 'resetsAt'>): string {
  return `Shifts today: ${day.started} of ${day.cap}. Resets after the daily tick (${day.resetsAt}).`;
}

const iso = (seconds: number) => new Date(seconds * 1000).toISOString();

/** Null when the flag is off (no query) or the world clock row is missing (no cap, and the count is not read). */
export async function readShiftDay(db: GameDatabase, env: object | null | undefined, userId: string, nowSeconds: number): Promise<ShiftDay | null> {
  if (!shiftSoftCapEnabled(env)) return null;
  const clock = await db.prepare("SELECT epoch_seconds FROM world_clock WHERE id='main'").first<{ epoch_seconds: number }>();
  const day = shiftDayAt(clock ? { epochSeconds: Number(clock.epoch_seconds), nowSeconds } : null);
  if (!day) return null;
  const row = await db.prepare('SELECT COUNT(*) AS n FROM work_shifts WHERE clerk_user_id=? AND started_at>=? AND started_at<?')
    .bind(userId, iso(day.start), iso(day.resetsAt)).first<{ n: number }>();
  return { started: Number(row?.n ?? 0), cap: DAILY_SHIFT_SOFT_CAP, resetsAt: iso(day.resetsAt) };
}

/** Assumes the caller already checked HARIMU_SHIFT_SOFT_CAP_ENABLED. This passes a hard-coded "true"
 *  and does not read the caller's env, so skipping that check would enforce the cap while the flag is off.
 *  Null when the clock is missing or the citizen is under the cap. Does not write. */
export async function refuseNewShift(db: GameDatabase, userId: string, nowSeconds: number): Promise<{ error: string; shiftDay: ShiftDay } | null> {
  const shiftDay = await readShiftDay(db, { HARIMU_SHIFT_SOFT_CAP_ENABLED: 'true' }, userId, nowSeconds);
  if (!shiftDay || shiftDay.started < shiftDay.cap) return null;
  return { error: shiftCapRefusal, shiftDay };
}
