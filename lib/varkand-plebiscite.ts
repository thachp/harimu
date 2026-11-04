/** #1094: Mandate Plebiscite every 150 real days (5 game years). Pure: no database, so no migration.
 *  The ballot, turnout, and the Conclave of Colonels are out of scope.
 *  [ASSUMPTION] The cycle reuses VARKAND_CHAIR_ANCHOR_MS from #1085 (the Unix epoch). A real day is
 *  86_400_000 ms, so 150 real days is a fixed multiple, not five calendar months. */
import { VARKAND_CHAIR_ANCHOR_MS } from './varkand-directorate.ts';

export const VARKAND_PLEBISCITE_CYCLE_DAYS = 150;
export const VARKAND_PLEBISCITE_MS = VARKAND_PLEBISCITE_CYCLE_DAYS * 86_400_000;
const maxStep = Math.floor(Number.MAX_SAFE_INTEGER / VARKAND_PLEBISCITE_MS) - 1;

/** Next Mandate Plebiscite, in integer milliseconds. At a boundary the following cycle is next. Before the anchor, the first plebiscite is one cycle after the anchor. */
export function varkandNextPlebisciteAt(nowMs: number): number {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
  const elapsed = Math.max(0, now - VARKAND_CHAIR_ANCHOR_MS);
  const step = Math.min(Math.floor(elapsed / VARKAND_PLEBISCITE_MS), maxStep);
  return VARKAND_CHAIR_ANCHOR_MS + (step + 1) * VARKAND_PLEBISCITE_MS;
}
