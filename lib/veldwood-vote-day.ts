/** #1122: Vote Days every 15 real days. Pure: no database, so no migration.
 *  The referendum, ballot items, and the 72-hour window are out of scope.
 *  [ASSUMPTION] The cycle reuses VARKAND_CHAIR_ANCHOR_MS from #1085 (the Unix epoch). A real day is
 *  86_400_000 ms, so 15 real days is a fixed multiple, not a calendar fortnight. */
import { VARKAND_CHAIR_ANCHOR_MS } from './varkand-directorate.ts';

export const VELDWOOD_VOTE_DAY_CYCLE_DAYS = 15;
export const VELDWOOD_VOTE_DAY_MS = VELDWOOD_VOTE_DAY_CYCLE_DAYS * 86_400_000;
const maxStep = Math.floor(Number.MAX_SAFE_INTEGER / VELDWOOD_VOTE_DAY_MS) - 1;

/** Next Vote Day, in integer milliseconds. At a boundary the following cycle is next. Before the anchor, the first Vote Day is one cycle after the anchor. */
export function veldwoodNextVoteDayAt(nowMs: number): number {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
  const elapsed = Math.max(0, now - VARKAND_CHAIR_ANCHOR_MS);
  const step = Math.min(Math.floor(elapsed / VELDWOOD_VOTE_DAY_MS), maxStep);
  return VARKAND_CHAIR_ANCHOR_MS + (step + 1) * VELDWOOD_VOTE_DAY_MS;
}
