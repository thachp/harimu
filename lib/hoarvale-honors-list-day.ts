/** #1136: Hoarvale next Honors List Day on the government read (docs §7.7). Pure: no database, so no migration.
 *  Awards no titles, lists no recipients, and proposes no spending.
 *  [ASSUMPTION] Docs give Honors List Day no interval. Cadence is once per game year = realDaysPerGameYear
 *  (30 real days) from VARKAND_CHAIR_ANCHOR_MS (#1085), the same Chair/Congress family as other nation clocks.
 *  A real day is 86_400_000 ms. At a boundary the following day is next. Before the anchor, the first
 *  Honors List Day is one cycle after the anchor. */
import { realDaysPerGameYear } from './election-calendars.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from './varkand-directorate.ts';

export const HOARVALE_HONORS_LIST_INTERVAL_DAYS = realDaysPerGameYear;
export const HOARVALE_HONORS_LIST_MS = HOARVALE_HONORS_LIST_INTERVAL_DAYS * 86_400_000;
const maxStep = Math.floor(Number.MAX_SAFE_INTEGER / HOARVALE_HONORS_LIST_MS) - 1;

/** Next Honors List Day, integer ms. */
export function hoarvaleNextHonorsListDayAt(nowMs: number): number {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
  const elapsed = Math.max(0, now - VARKAND_CHAIR_ANCHOR_MS);
  const step = Math.min(Math.floor(elapsed / HOARVALE_HONORS_LIST_MS), maxStep);
  return VARKAND_CHAIR_ANCHOR_MS + (step + 1) * HOARVALE_HONORS_LIST_MS;
}
