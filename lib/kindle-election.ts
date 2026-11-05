/** #1117: presidential term end and the next Ballot Night. Pure: no database, so no migration.
 *  The read opens no ballot, names no winner, and proposes no spending.
 *  The anchor is the Kindle cycle already in code (#351/#878/#918/#936): HARIMU_KINDLE_CYCLE_START_AT,
 *  the founding election on day 30, and a 4-game-year term (KINDLE_CALENDAR.cycleDays = 4 × realDaysPerGameYear
 *  = 120 real days). A real day is 86_400_000 ms, the same conversion the other nation clocks use.
 *  Unset, malformed, or non-positive cycle start, or a clock that is not a safe integer: held, no dates.
 *  [ASSUMPTION] Ballot Night is the close of that presidential vote (open + 72 real hours). That is when a count
 *  can be recorded and results can be projected on the Assembly dome. The calendar has no separate Ballot Night instant.
 *  [ASSUMPTION] A term begins at each presidential open and ends at the next open. Before the founding open the first
 *  term has not begun; the clock names when that first term ends (one cycle after the founding open).
 *  At a boundary the following term end or Ballot Night is next. Timestamps are integer milliseconds. */
import { KINDLE_CALENDAR, realDaysPerGameYear } from './election-calendars.ts';

const DAY_MS = 86_400_000;
export const KINDLE_PRESIDENTIAL_TERM_DAYS = 4 * realDaysPerGameYear;
export const KINDLE_PRESIDENTIAL_TERM_MS = KINDLE_PRESIDENTIAL_TERM_DAYS * DAY_MS;
export const KINDLE_BALLOT_NIGHT_VOTE_MS = KINDLE_CALENDAR.voteHours * 3_600_000;
export const KINDLE_MAX_CONSECUTIVE_TERMS = 2 as const;
const FOUNDING_OPEN_MS = KINDLE_CALENDAR.foundingElectionDay * DAY_MS;

export type KindleElectionClock = {
  termEndsAt: number;
  nextBallotNightAt: number;
  termDays: number;
  maxConsecutiveTerms: 2;
};

/** The next mark strictly after `now`. Before `first`, the first mark is next. Null when the result would not be a safe integer. */
function nextStrictlyAfter(first: number, every: number, now: number): number | null {
  if (now < first) return first;
  const room = Number.MAX_SAFE_INTEGER - first;
  if (room < every) return null;
  const step = Math.floor((now - first) / every) + 1;
  if (step < 1 || step > Math.floor(room / every)) return null;
  const at = first + step * every;
  return Number.isSafeInteger(at) ? at : null;
}

/** Term end and next Ballot Night, or null when the cycle is held. `cycleStartSeconds` is HARIMU_KINDLE_CYCLE_START_AT. */
export function kindleElectionClock(cycleStartSeconds: number | null, nowMs: number): KindleElectionClock | null {
  if (cycleStartSeconds === null || !Number.isSafeInteger(cycleStartSeconds) || cycleStartSeconds <= 0 || !Number.isSafeInteger(nowMs)) return null;
  if (KINDLE_PRESIDENTIAL_TERM_DAYS !== KINDLE_CALENDAR.cycleDays) return null;
  const startMs = cycleStartSeconds * 1000;
  const firstOpen = startMs + FOUNDING_OPEN_MS;
  const firstClose = firstOpen + KINDLE_BALLOT_NIGHT_VOTE_MS;
  if (!Number.isSafeInteger(startMs) || !Number.isSafeInteger(firstOpen) || !Number.isSafeInteger(firstClose)) return null;
  const termEndsAt = nowMs < firstOpen ? firstOpen + KINDLE_PRESIDENTIAL_TERM_MS : nextStrictlyAfter(firstOpen, KINDLE_PRESIDENTIAL_TERM_MS, nowMs);
  const nextBallotNightAt = nextStrictlyAfter(firstClose, KINDLE_PRESIDENTIAL_TERM_MS, nowMs);
  if (termEndsAt === null || nextBallotNightAt === null || !Number.isSafeInteger(termEndsAt)) return null;
  return { termEndsAt, nextBallotNightAt, termDays: KINDLE_PRESIDENTIAL_TERM_DAYS, maxConsecutiveTerms: KINDLE_MAX_CONSECUTIVE_TERMS };
}
