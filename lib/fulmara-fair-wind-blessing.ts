/** #1184: Fair-Wind Blessing once per game year. Pure: no database, so no migration.
 *  The read holds the next date only: no blessing text, convoy list, or Toll Coupon figure.
 *  [ASSUMPTION] Docs §7.10 name the Fair-Wind Blessing of the convoys and give no interval or anniversary offset.
 *  A game year is 30 real days (docs §17.1: 1 real month = 1 game year). The cycle reuses
 *  VARKAND_CHAIR_ANCHOR_MS from #1085 (the Unix epoch), with no offset. A real day is 86_400_000 ms, so 30 real days
 *  is a fixed multiple, not a calendar month. */
import { VARKAND_CHAIR_ANCHOR_MS } from './varkand-directorate.ts';

export const FULMARA_FAIR_WIND_BLESSING_CYCLE_DAYS = 30;
export const FULMARA_FAIR_WIND_BLESSING_MS = FULMARA_FAIR_WIND_BLESSING_CYCLE_DAYS * 86_400_000;
const maxStep = Math.floor(Number.MAX_SAFE_INTEGER / FULMARA_FAIR_WIND_BLESSING_MS) - 1;

/** Next Fair-Wind Blessing, in integer milliseconds. Takes nowMs only. At a boundary the following cycle is next. Before the anchor, the next date is one cycle after the anchor. */
export function fulmaraNextFairWindBlessingAt(nowMs: number): number {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
  const elapsed = Math.max(0, now - VARKAND_CHAIR_ANCHOR_MS);
  const step = Math.min(Math.floor(elapsed / FULMARA_FAIR_WIND_BLESSING_MS), maxStep);
  return VARKAND_CHAIR_ANCHOR_MS + (step + 1) * FULMARA_FAIR_WIND_BLESSING_MS;
}
