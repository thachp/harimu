/** #1183: Confluence next Congress Lanterns. Pure: no database, so no migration.
 *  Docs §7.2 float a lantern for each delegate at every Party Congress. This read stores only the next date.
 *  It holds no lantern count, delegate list, or Party text, and names no persona.
 *  [ASSUMPTION] 30 real days from the Varkand anchor, no offset, nowMs only, next date only (pre-accepted by Architect).
 *  The Party Congress schedule (#1113) is 150 real days. This clock does not reuse it.
 *  At a boundary the following date is next. Before the anchor, the next date is one cycle after the anchor.
 *  A real day is 86_400_000 ms. */
import { VARKAND_CHAIR_ANCHOR_MS } from './varkand-directorate.ts';

const DAY_MS = 86_400_000;

/** [ASSUMPTION] 30 real days from the Varkand anchor, no offset. */
export const CONFLUENCE_CONGRESS_LANTERNS_CYCLE_DAYS = 30 as const;
export const CONFLUENCE_CONGRESS_LANTERNS_CYCLE_MS = CONFLUENCE_CONGRESS_LANTERNS_CYCLE_DAYS * DAY_MS;
const maxStep = Math.floor(Number.MAX_SAFE_INTEGER / CONFLUENCE_CONGRESS_LANTERNS_CYCLE_MS) - 1;

/** Next Congress Lanterns, in integer milliseconds. Takes nowMs only and returns the next date only. */
export function confluenceNextCongressLanternsAt(nowMs: number): number {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
  const elapsed = Math.max(0, now - VARKAND_CHAIR_ANCHOR_MS);
  const step = Math.min(Math.floor(elapsed / CONFLUENCE_CONGRESS_LANTERNS_CYCLE_MS), maxStep);
  return VARKAND_CHAIR_ANCHOR_MS + (step + 1) * CONFLUENCE_CONGRESS_LANTERNS_CYCLE_MS;
}
