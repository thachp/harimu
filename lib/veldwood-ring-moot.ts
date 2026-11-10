/** #1244: Veldwood next midsummer Ring Moot on the government read (docs §17.1, §7.9). Pure: no database, so no migration.
 *  Holds the next date only. No motions, votes, turnout, or potluck text.
 *  [ASSUMPTION] Midsummer is 11.25 real days = 972_000_000 ms into the 30-day year from VARKAND_CHAIR_ANCHOR_MS
 *  (summer starts at 7.5 days, plus half a season). Accepted by Architect on #1244.
 *  [ASSUMPTION] One federation-wide midsummer date; per-Grove Ring Moots are not modeled. Accepted by Architect on #1244.
 *  Cadence is once per game year = realDaysPerGameYear (30 real days). At a boundary the following date is next.
 *  Before the anchor, the next date is the first one after the anchor (anchor + offset).
 *  A real day is 86_400_000 ms. The shard world_clock epoch is per shard, so this read does not follow it. */
import { realDaysPerGameYear } from './election-calendars.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from './varkand-directorate.ts';

const DAY_MS = 86_400_000;

/** [ASSUMPTION] Once per game year. Tests pin this to realDaysPerGameYear (30). */
export const VELDWOOD_RING_MOOT_CYCLE_DAYS = realDaysPerGameYear;
export const VELDWOOD_RING_MOOT_CYCLE_MS = VELDWOOD_RING_MOOT_CYCLE_DAYS * DAY_MS;
/** [ASSUMPTION] Midsummer offset: 11.25 real days into the year (Architect-accepted on #1244). */
export const VELDWOOD_RING_MOOT_OFFSET_MS = 972_000_000;
const maxStep = Math.floor(Number.MAX_SAFE_INTEGER / VELDWOOD_RING_MOOT_CYCLE_MS) - 1;

/** Next midsummer Ring Moot, in integer milliseconds. Date only. */
export function veldwoodNextRingMootAt(nowMs: number): number {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
  const first = VARKAND_CHAIR_ANCHOR_MS + VELDWOOD_RING_MOOT_OFFSET_MS;
  if (now < first) return first;
  const elapsed = now - first;
  const step = Math.min(Math.floor(elapsed / VELDWOOD_RING_MOOT_CYCLE_MS), maxStep);
  return first + (step + 1) * VELDWOOD_RING_MOOT_CYCLE_MS;
}
