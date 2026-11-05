/** #1159: Veldwood next Dividend Day on the government read (docs §7.9). Pure: no database, so no migration.
 *  Pays no dividend and states no amount.
 *  [ASSUMPTION] The Common Fund pays a yearly Citizen Dividend. Cadence is once per game year =
 *  realDaysPerGameYear (30 real days) from VARKAND_CHAIR_ANCHOR_MS (#1085), the same Chair family
 *  as the other nation clocks. A real day is 86_400_000 ms. At a boundary the following day is next.
 *  Before the anchor, the next Dividend Day is one cycle after the anchor. The shard world_clock
 *  epoch is per shard, so this read does not follow it. */
import { realDaysPerGameYear } from './election-calendars.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from './varkand-directorate.ts';

const DAY_MS = 86_400_000;

/** [ASSUMPTION] Once per game year. Tests pin this to realDaysPerGameYear (30). */
export const VELDWOOD_DIVIDEND_DAY_CYCLE_DAYS = realDaysPerGameYear;
export const VELDWOOD_DIVIDEND_DAY_CYCLE_MS = VELDWOOD_DIVIDEND_DAY_CYCLE_DAYS * DAY_MS;
const maxStep = Math.floor(Number.MAX_SAFE_INTEGER / VELDWOOD_DIVIDEND_DAY_CYCLE_MS) - 1;

/** Next Dividend Day, in integer milliseconds. Pays nothing. */
export function veldwoodNextDividendDayAt(nowMs: number): number {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
  const elapsed = Math.max(0, now - VARKAND_CHAIR_ANCHOR_MS);
  const step = Math.min(Math.floor(elapsed / VELDWOOD_DIVIDEND_DAY_CYCLE_MS), maxStep);
  return VARKAND_CHAIR_ANCHOR_MS + (step + 1) * VELDWOOD_DIVIDEND_DAY_CYCLE_MS;
}
