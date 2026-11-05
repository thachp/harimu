/** #1123: People's Assembly election window every 150 real days (docs: the-confluence §7.2, elections §9.6).
 *  Pure: no database, so no migration. Opens no ballot, lists no candidates, and leadership does not heed the result.
 *  Same anchor family as the #1113 Party Congress: VARKAND_CHAIR_ANCHOR_MS (#1085), 150 × 86_400_000 ms. */
import { VARKAND_CHAIR_ANCHOR_MS } from './varkand-directorate.ts';

export const CONFLUENCE_ASSEMBLY_INTERVAL_DAYS = 150;
export const CONFLUENCE_ASSEMBLY_MS = CONFLUENCE_ASSEMBLY_INTERVAL_DAYS * 86_400_000;
const maxStep = Math.floor(Number.MAX_SAFE_INTEGER / CONFLUENCE_ASSEMBLY_MS) - 1;
const stepAt = (nowMs: number) => {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
  return Math.min(Math.floor(Math.max(0, now - VARKAND_CHAIR_ANCHOR_MS) / CONFLUENCE_ASSEMBLY_MS), maxStep);
};

/** Next People's Assembly election, integer ms. At a boundary the following cycle is next; before the anchor, the first is one cycle after it. */
export function confluenceNextAssemblyElectionAt(nowMs: number): number {
  return VARKAND_CHAIR_ANCHOR_MS + (stepAt(nowMs) + 1) * CONFLUENCE_ASSEMBLY_MS;
}

/** Start of the current 150-day Assembly cycle (the anchor before the first one). */
export function confluenceLastAssemblyElectionAt(nowMs: number): number {
  return VARKAND_CHAIR_ANCHOR_MS + stepAt(nowMs) * CONFLUENCE_ASSEMBLY_MS;
}
