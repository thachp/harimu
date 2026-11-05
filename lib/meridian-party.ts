/** #1114: Meridian Party Congress schedule. Pure: no database, so no migration.
 *  Choosing the Paramount Leader, Standing Committee membership, and suspending term limits are out of scope.
 *  [ASSUMPTION] The Congress clock reuses VARKAND_CHAIR_ANCHOR_MS from #1085 (the Unix epoch). A Congress sits
 *  every 5 game years = 150 real days (5 × realDaysPerGameYear). A real day is 86_400_000 ms.
 *  At a boundary the following Congress is next, matching the Mandate Plebiscite (#1094).
 *  Before the anchor, the next Congress is one cycle after the anchor. */
import { VARKAND_CHAIR_ANCHOR_MS } from './varkand-directorate.ts';

const DAY_MS = 86_400_000;

export const MERIDIAN_PARAMOUNT_LEADER_ROLES = ['general_secretary', 'state_chair'] as const;
export const MERIDIAN_STANDING_COMMITTEE_SEATS = 7 as const;
export const MERIDIAN_CONGRESS_INTERVAL_DAYS = 150 as const;
export const MERIDIAN_CONGRESS_INTERVAL_MS = MERIDIAN_CONGRESS_INTERVAL_DAYS * DAY_MS;
export const MERIDIAN_TERM_LIMIT_SUSPEND_SUPERMAJORITY = '2/3' as const;

/** Next Party Congress, in integer milliseconds. The step is capped so the result stays a safe integer. */
export function meridianNextPartyCongressAt(nowMs: number): number {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
  const maxStep = Math.floor(Number.MAX_SAFE_INTEGER / MERIDIAN_CONGRESS_INTERVAL_MS) - 1;
  const elapsed = Math.max(0, now - VARKAND_CHAIR_ANCHOR_MS);
  const step = Math.min(Math.floor(elapsed / MERIDIAN_CONGRESS_INTERVAL_MS), maxStep);
  return VARKAND_CHAIR_ANCHOR_MS + (step + 1) * MERIDIAN_CONGRESS_INTERVAL_MS;
}
