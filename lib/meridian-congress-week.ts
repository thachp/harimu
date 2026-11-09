/** #1189: Meridian next Congress Week on the government read (docs §7.3). Pure: no database, so no migration.
 *  Date only — no congress agenda, Standing Committee roster, or SEZ text.
 *  [ASSUMPTION] Docs §7.3 say Congress Week falls every 5 game years. With realDaysPerGameYear = 30 that is
 *  150 real days from VARKAND_CHAIR_ANCHOR_MS (#1085), zero anniversary offset (Architect pre-accepted).
 *  A real day is 86_400_000 ms. At a boundary the following cycle is next. Before the anchor, the first
 *  Congress Week is one cycle after the anchor. Distinct from #1114 partyState.nextCongressAt (Party Congress schedule). */
import { realDaysPerGameYear } from './election-calendars.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from './varkand-directorate.ts';

export const MERIDIAN_CONGRESS_WEEK_INTERVAL_DAYS = (5 * realDaysPerGameYear) as 150;
export const MERIDIAN_CONGRESS_WEEK_MS = MERIDIAN_CONGRESS_WEEK_INTERVAL_DAYS * 86_400_000;
const maxStep = Math.floor(Number.MAX_SAFE_INTEGER / MERIDIAN_CONGRESS_WEEK_MS) - 1;

/** Next Congress Week, integer ms. */
export function meridianNextCongressWeekAt(nowMs: number): number {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
  const elapsed = Math.max(0, now - VARKAND_CHAIR_ANCHOR_MS);
  const step = Math.min(Math.floor(elapsed / MERIDIAN_CONGRESS_WEEK_MS), maxStep);
  return VARKAND_CHAIR_ANCHOR_MS + (step + 1) * MERIDIAN_CONGRESS_WEEK_MS;
}
