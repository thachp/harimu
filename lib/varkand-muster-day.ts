/** #1151: Varkand next Muster Day on the government read (docs §7.8, Watchfast). Pure: no database, so no migration.
 *  Musters no troops and changes no Alert Level.
 *  [ASSUMPTION] Docs name Muster Day and give no interval. Cadence is once per game year = realDaysPerGameYear
 *  (30 real days) from VARKAND_CHAIR_ANCHOR_MS (#1085), the same family as #1136 and #1145.
 *  A real day is 86_400_000 ms. At a boundary the following day is next. Before the anchor, the first
 *  Muster Day is one cycle after the anchor. */
import { realDaysPerGameYear } from './election-calendars.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from './varkand-directorate.ts';

export const VARKAND_MUSTER_DAY_INTERVAL_DAYS = realDaysPerGameYear;
export const VARKAND_MUSTER_DAY_MS = VARKAND_MUSTER_DAY_INTERVAL_DAYS * 86_400_000;
const maxStep = Math.floor(Number.MAX_SAFE_INTEGER / VARKAND_MUSTER_DAY_MS) - 1;

/** Next Muster Day, integer ms. */
export function varkandNextMusterDayAt(nowMs: number): number {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
  const elapsed = Math.max(0, now - VARKAND_CHAIR_ANCHOR_MS);
  const step = Math.min(Math.floor(elapsed / VARKAND_MUSTER_DAY_MS), maxStep);
  return VARKAND_CHAIR_ANCHOR_MS + (step + 1) * VARKAND_MUSTER_DAY_MS;
}
