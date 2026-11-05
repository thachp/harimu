/** #1165: Confluence next Canal Festival on the government read (docs §7.2, Lanu Terraces). Pure: no database, so no migration.
 *  Holds no festival, harvest yield, or bonus — date only; host city may be named.
 *  [ASSUMPTION] Docs say "after the harvest" with no interval. Cadence is once per game year = realDaysPerGameYear
 *  (30 real days) from VARKAND_CHAIR_ANCHOR_MS (#1085), the same family as #1136, #1145, and #1151. Zero post-harvest
 *  offset (same as other clocks) — no separate harvest clock is in scope.
 *  A real day is 86_400_000 ms. At a boundary the following day is next. Before the anchor, the first
 *  Canal Festival is one cycle after the anchor. */
import { realDaysPerGameYear } from './election-calendars.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from './varkand-directorate.ts';

export const CONFLUENCE_CANAL_FESTIVAL_INTERVAL_DAYS = realDaysPerGameYear;
export const CONFLUENCE_CANAL_FESTIVAL_MS = CONFLUENCE_CANAL_FESTIVAL_INTERVAL_DAYS * 86_400_000;
export const CONFLUENCE_CANAL_FESTIVAL_HOST_CITY = 'Lanu Terraces' as const;
const maxStep = Math.floor(Number.MAX_SAFE_INTEGER / CONFLUENCE_CANAL_FESTIVAL_MS) - 1;

/** Next Canal Festival, integer ms. */
export function confluenceNextCanalFestivalAt(nowMs: number): number {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
  const elapsed = Math.max(0, now - VARKAND_CHAIR_ANCHOR_MS);
  const step = Math.min(Math.floor(elapsed / CONFLUENCE_CANAL_FESTIVAL_MS), maxStep);
  return VARKAND_CHAIR_ANCHOR_MS + (step + 1) * CONFLUENCE_CANAL_FESTIVAL_MS;
}
