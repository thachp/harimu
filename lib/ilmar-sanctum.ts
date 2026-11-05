/** #1107: Oracle life term, Stilldays, and the Great Pilgrimage. Pure: no database, so no migration.
 *  Trading pauses, choosing an Oracle, and pilgrimage rewards are out of scope.
 *  [ASSUMPTION] Both clocks reuse VARKAND_CHAIR_ANCHOR_MS from #1085 (the Unix epoch). A real day is
 *  86_400_000 ms. At a boundary the following cycle is next, matching the Mandate Plebiscite (#1094).
 *  Before the anchor, the next Stillday and the next Great Pilgrimage are one cycle after the anchor.
 *  [ASSUMPTION] A game year is realDaysPerGameYear (30 real days), the world-clock year, not a calendar month.
 *  [ASSUMPTION] No Unix-epoch game-week helper exists. korundWeekSeconds is 7 game days (50_400 s) on the
 *  shard world clock, so this read does not use it. A Stillday week is 7 real days. The Stillday window
 *  is the first real day of that week, half-open. isStillday is true only inside that day. */
import { realDaysPerGameYear } from './election-calendars.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from './varkand-directorate.ts';

const DAY_MS = 86_400_000;

export const ILMAR_ORACLE_TERM = 'life' as const;
export const ILMAR_COUNCIL_OF_ELDERS_SEATS = 12 as const;

export const ILMAR_STILLDAY_CYCLE_DAYS = 7;
export const ILMAR_STILLDAY_CYCLE_MS = ILMAR_STILLDAY_CYCLE_DAYS * DAY_MS;
/** [ASSUMPTION] one real day. The docs say the weekly rest lasts "until it ends" and give no length. */
export const ILMAR_STILLDAY_WINDOW_MS = DAY_MS;

export const ILMAR_PILGRIMAGE_CYCLE_DAYS = realDaysPerGameYear;
export const ILMAR_PILGRIMAGE_CYCLE_MS = ILMAR_PILGRIMAGE_CYCLE_DAYS * DAY_MS;

function clock(nowMs: number): number {
  return Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
}

/** Next cycle boundary. The step is capped so the result stays a safe integer. */
function nextCycleAt(nowMs: number, periodMs: number): number {
  const maxStep = Math.floor(Number.MAX_SAFE_INTEGER / periodMs) - 1;
  const elapsed = Math.max(0, clock(nowMs) - VARKAND_CHAIR_ANCHOR_MS);
  const step = Math.min(Math.floor(elapsed / periodMs), maxStep);
  return VARKAND_CHAIR_ANCHOR_MS + (step + 1) * periodMs;
}

/** Next Stillday, in integer milliseconds. During a Stillday this is the following week's start. */
export function ilmarNextStilldayAt(nowMs: number): number {
  return nextCycleAt(nowMs, ILMAR_STILLDAY_CYCLE_MS);
}

/** Next Great Pilgrimage, in integer milliseconds. Once per game year. */
export function ilmarNextGreatPilgrimageAt(nowMs: number): number {
  return nextCycleAt(nowMs, ILMAR_PILGRIMAGE_CYCLE_MS);
}

/** True only inside the Stillday window. Before the anchor, false. */
export function ilmarIsStillday(nowMs: number): boolean {
  const now = clock(nowMs);
  if (now < VARKAND_CHAIR_ANCHOR_MS) return false;
  const start = ilmarNextStilldayAt(now) - ILMAR_STILLDAY_CYCLE_MS;
  return now >= start && now < start + ILMAR_STILLDAY_WINDOW_MS;
}
