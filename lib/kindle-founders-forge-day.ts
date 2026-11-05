/** #1145: Kindle next Founders' Forge Day on the government read (docs §7.1). Pure: no database, so no migration.
 *  Opens no fair, lists no stalls, and proposes no spending.
 *  [ASSUMPTION] Docs call Founders' Forge Day the Republic's anniversary and give no interval. Cadence is once per
 *  game year = realDaysPerGameYear (30 real days) from VARKAND_CHAIR_ANCHOR_MS (#1085), the same family as #1136.
 *  A real day is 86_400_000 ms. At a boundary the following day is next. Before the anchor, the first
 *  Founders' Forge Day is one cycle after the anchor. */
import { realDaysPerGameYear } from './election-calendars.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from './varkand-directorate.ts';

export const KINDLE_FOUNDERS_FORGE_INTERVAL_DAYS = realDaysPerGameYear;
export const KINDLE_FOUNDERS_FORGE_MS = KINDLE_FOUNDERS_FORGE_INTERVAL_DAYS * 86_400_000;
const maxStep = Math.floor(Number.MAX_SAFE_INTEGER / KINDLE_FOUNDERS_FORGE_MS) - 1;

/** Next Founders' Forge Day, integer ms. */
export function kindleNextFoundersForgeDayAt(nowMs: number): number {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
  const elapsed = Math.max(0, now - VARKAND_CHAIR_ANCHOR_MS);
  const step = Math.min(Math.floor(elapsed / KINDLE_FOUNDERS_FORGE_MS), maxStep);
  return VARKAND_CHAIR_ANCHOR_MS + (step + 1) * KINDLE_FOUNDERS_FORGE_MS;
}
