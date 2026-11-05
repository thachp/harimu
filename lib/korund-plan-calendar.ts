/** #1116: Korund Five-Year Plan calendar (Plan Day and quarterly Quota Rally). Pure: no database, so no migration.
 *  Setting quotas, opening a rally, and plan or ration mechanics are out of scope.
 *  [ASSUMPTION] The Plan clock reuses VARKAND_CHAIR_ANCHOR_MS from #1085 (the Unix epoch), like #1114.
 *  A Five-Year Plan lasts 5 game years = 150 real days. Plan Day is the start of each Plan.
 *  A Quota Rally opens each quarter: every 150/4 = 37.5 real days = 3_240_000_000 ms (an exact integer).
 *  At a boundary the following date is next (#1094, #1114). Before the anchor, the first Plan starts at the anchor. */
import { VARKAND_CHAIR_ANCHOR_MS } from './varkand-directorate.ts';

const DAY_MS = 86_400_000;

export const KORUND_PLAN_INTERVAL_DAYS = 150 as const;
export const KORUND_PLAN_INTERVAL_MS = KORUND_PLAN_INTERVAL_DAYS * DAY_MS;
export const KORUND_QUOTA_RALLIES_PER_PLAN = 4 as const;
export const KORUND_QUOTA_RALLY_INTERVAL_MS = KORUND_PLAN_INTERVAL_MS / KORUND_QUOTA_RALLIES_PER_PLAN;

/** Whole steps of `interval` since the anchor, capped so anchor + (step + 1) * interval stays a safe integer. */
function stepsSinceAnchor(nowMs: number, interval: number): number {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
  const maxStep = Math.floor(Number.MAX_SAFE_INTEGER / interval) - 1;
  return Math.min(Math.floor(Math.max(0, now - VARKAND_CHAIR_ANCHOR_MS) / interval), maxStep);
}

/** Start of the current Five-Year Plan (the latest Plan Day at or before now), in integer ms. */
export function korundCurrentPlanStartedAt(nowMs: number): number {
  return VARKAND_CHAIR_ANCHOR_MS + stepsSinceAnchor(nowMs, KORUND_PLAN_INTERVAL_MS) * KORUND_PLAN_INTERVAL_MS;
}

/** Next Plan Day (start of the next Five-Year Plan), in integer ms. */
export function korundNextPlanDayAt(nowMs: number): number {
  return korundCurrentPlanStartedAt(nowMs) + KORUND_PLAN_INTERVAL_MS;
}

/** Next quarterly Quota Rally, in integer ms. Every fourth one falls on a Plan Day. */
export function korundNextQuotaRallyAt(nowMs: number): number {
  return VARKAND_CHAIR_ANCHOR_MS + (stepsSinceAnchor(nowMs, KORUND_QUOTA_RALLY_INTERVAL_MS) + 1) * KORUND_QUOTA_RALLY_INTERVAL_MS;
}
