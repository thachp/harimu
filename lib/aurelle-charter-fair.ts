/** #1197: Aurelle next Charter Fair. Pure: no database, so no migration.
 *  Docs §7.5 name the fair. This read stores only the next date.
 *  It holds no charter list, guild name, or trade right.
 *  [ASSUMPTION] 30 real days from the Varkand anchor, no offset, nowMs only, next date only (pre-accepted by Architect).
 *  At a boundary the following date is next. Before the anchor, the next date is one cycle after the anchor.
 *  A real day is 86_400_000 ms. */
import { VARKAND_CHAIR_ANCHOR_MS } from './varkand-directorate.ts';

const DAY_MS = 86_400_000;

/** [ASSUMPTION] 30 real days from the Varkand anchor, no offset. */
export const AURELLE_CHARTER_FAIR_CYCLE_DAYS = 30 as const;
export const AURELLE_CHARTER_FAIR_CYCLE_MS = AURELLE_CHARTER_FAIR_CYCLE_DAYS * DAY_MS;
const maxStep = Math.floor(Number.MAX_SAFE_INTEGER / AURELLE_CHARTER_FAIR_CYCLE_MS) - 1;

/** Next Charter Fair, in integer milliseconds. Takes nowMs only and returns the next date only. */
export function aurelleNextCharterFairAt(nowMs: number): number {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
  const elapsed = Math.max(0, now - VARKAND_CHAIR_ANCHOR_MS);
  const step = Math.min(Math.floor(elapsed / AURELLE_CHARTER_FAIR_CYCLE_MS), maxStep);
  return VARKAND_CHAIR_ANCHOR_MS + (step + 1) * AURELLE_CHARTER_FAIR_CYCLE_MS;
}
