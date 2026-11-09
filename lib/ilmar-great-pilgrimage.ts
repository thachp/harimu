/** #1196: Ilmar next Great Pilgrimage. Pure: no database, so no migration.
 *  The read holds the next date only: no pilgrim counts, routes, shrine names, or Oracle text.
 *  [ASSUMPTION] Docs §7.6 name the Great Pilgrimage once per game year and give no anniversary offset.
 *  A game year is 30 real days (docs §17: 1 real month = 1 game year). The cycle reuses
 *  VARKAND_CHAIR_ANCHOR_MS from #1085 (the Unix epoch), with no offset. A real day is 86_400_000 ms, so 30 real days
 *  is a fixed multiple, not a calendar month. */
import { VARKAND_CHAIR_ANCHOR_MS } from './varkand-directorate.ts';

export const ILMAR_GREAT_PILGRIMAGE_CYCLE_DAYS = 30 as const;
export const ILMAR_GREAT_PILGRIMAGE_CYCLE_MS = ILMAR_GREAT_PILGRIMAGE_CYCLE_DAYS * 86_400_000;
const maxStep = Math.floor(Number.MAX_SAFE_INTEGER / ILMAR_GREAT_PILGRIMAGE_CYCLE_MS) - 1;

/** Next Great Pilgrimage, in integer milliseconds. Takes nowMs only. At a boundary the following cycle is next. Before the anchor, the next date is one cycle after the anchor. */
export function ilmarNextGreatPilgrimageAt(nowMs: number): number {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
  const elapsed = Math.max(0, now - VARKAND_CHAIR_ANCHOR_MS);
  const step = Math.min(Math.floor(elapsed / ILMAR_GREAT_PILGRIMAGE_CYCLE_MS), maxStep);
  return VARKAND_CHAIR_ANCHOR_MS + (step + 1) * ILMAR_GREAT_PILGRIMAGE_CYCLE_MS;
}
