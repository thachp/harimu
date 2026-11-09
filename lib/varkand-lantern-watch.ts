/** #1211: Varkand next Lantern Watch. Pure: no database, so no migration.
 *  Docs name the watch and give no cadence or anchor. This read stores only the next date.
 *  It names no host and applies no Red Alert cancellation or holiday effect.
 *  [ASSUMPTION] 30 real days from the Varkand anchor, no offset, nowMs only, next date only.
 *  At a boundary the following date is next. Before the anchor, the next date is one cycle after the anchor.
 *  A real day is 86_400_000 ms. */
import { VARKAND_CHAIR_ANCHOR_MS } from './varkand-directorate.ts';

const DAY_MS = 86_400_000;

/** [ASSUMPTION] 30 real days from the Varkand anchor, no offset. */
export const VARKAND_LANTERN_WATCH_CYCLE_DAYS = 30 as const;
export const VARKAND_LANTERN_WATCH_CYCLE_MS = VARKAND_LANTERN_WATCH_CYCLE_DAYS * DAY_MS;
const maxStep = Math.floor(Number.MAX_SAFE_INTEGER / VARKAND_LANTERN_WATCH_CYCLE_MS) - 1;

/** Next Lantern Watch, in integer milliseconds. Takes nowMs only and returns the next date only. */
export function varkandNextLanternWatchAt(nowMs: number): number {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
  const elapsed = Math.max(0, now - VARKAND_CHAIR_ANCHOR_MS);
  const step = Math.min(Math.floor(elapsed / VARKAND_LANTERN_WATCH_CYCLE_MS), maxStep);
  return VARKAND_CHAIR_ANCHOR_MS + (step + 1) * VARKAND_LANTERN_WATCH_CYCLE_MS;
}
