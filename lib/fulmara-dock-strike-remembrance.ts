/** #1187: Fulmara next Dock Strike remembrance on the government read (docs §7.10). Pure: no database, so no migration.
 *  Date only — no strike text, Tribune veto counts, or Toll Coupon figures.
 *  [ASSUMPTION] Docs name the Dock Strike and give no interval. Cadence is once per game year = realDaysPerGameYear
 *  (30 real days) from VARKAND_CHAIR_ANCHOR_MS (#1085), the same family as #1150 and #1178. Zero anniversary offset
 *  (Architect pre-accepted). A real day is 86_400_000 ms. At a boundary the following cycle is next. Before the
 *  anchor, the first remembrance is one cycle after the anchor. */
import { realDaysPerGameYear } from './election-calendars.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from './varkand-directorate.ts';

export const FULMARA_DOCK_STRIKE_REMEMBRANCE_INTERVAL_DAYS = realDaysPerGameYear;
export const FULMARA_DOCK_STRIKE_REMEMBRANCE_MS = FULMARA_DOCK_STRIKE_REMEMBRANCE_INTERVAL_DAYS * 86_400_000;
const maxStep = Math.floor(Number.MAX_SAFE_INTEGER / FULMARA_DOCK_STRIKE_REMEMBRANCE_MS) - 1;

/** Next Dock Strike remembrance, integer ms. */
export function fulmaraNextDockStrikeRemembranceAt(nowMs: number): number {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
  const elapsed = Math.max(0, now - VARKAND_CHAIR_ANCHOR_MS);
  const step = Math.min(Math.floor(elapsed / FULMARA_DOCK_STRIKE_REMEMBRANCE_MS), maxStep);
  return VARKAND_CHAIR_ANCHOR_MS + (step + 1) * FULMARA_DOCK_STRIKE_REMEMBRANCE_MS;
}
