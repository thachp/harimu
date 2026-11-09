/** #1178: Fulmara next Grand Regatta on the government read (docs §7.10, Corvel Isles). Pure: no database, so no migration.
 *  Holds no race, prize, or bonus — date only; host city may be named.
 *  [ASSUMPTION] Docs name the Grand Regatta and give no interval. Cadence is once per game year = realDaysPerGameYear
 *  (30 real days) from VARKAND_CHAIR_ANCHOR_MS (#1085), the same family as #1150 and #1165. Zero anniversary offset
 *  (Architect pre-accepted). A real day is 86_400_000 ms. At a boundary the following day is next. Before the
 *  anchor, the first Grand Regatta is one cycle after the anchor. */
import { realDaysPerGameYear } from './election-calendars.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from './varkand-directorate.ts';

export const FULMARA_GRAND_REGATTA_INTERVAL_DAYS = realDaysPerGameYear;
export const FULMARA_GRAND_REGATTA_MS = FULMARA_GRAND_REGATTA_INTERVAL_DAYS * 86_400_000;
export const FULMARA_GRAND_REGATTA_HOST_CITY = 'Corvel Isles' as const;
const maxStep = Math.floor(Number.MAX_SAFE_INTEGER / FULMARA_GRAND_REGATTA_MS) - 1;

/** Next Grand Regatta, integer ms. */
export function fulmaraNextGrandRegattaAt(nowMs: number): number {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
  const elapsed = Math.max(0, now - VARKAND_CHAIR_ANCHOR_MS);
  const step = Math.min(Math.floor(elapsed / FULMARA_GRAND_REGATTA_MS), maxStep);
  return VARKAND_CHAIR_ANCHOR_MS + (step + 1) * FULMARA_GRAND_REGATTA_MS;
}
