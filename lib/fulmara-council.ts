/** #1102: Council of Ten (30 real days, one game year), Lodestar (90 real days) and the Tribune session (30 real days).
 *  Pure: no database, so no migration. The lot-and-ballot, the veto and Dock Strike are out of scope.
 *  [ASSUMPTION] All three clocks reuse VARKAND_CHAIR_ANCHOR_MS from the Varkand Chair rotation (#1087, #1085): the Unix epoch.
 *  A real day is 86_400_000 ms, so 30 and 90 real days are fixed multiples, not calendar months. */
import { VARKAND_CHAIR_ANCHOR_MS } from './varkand-directorate.ts';

export const FULMARA_COUNCIL_TERM_DAYS = 30;
export const FULMARA_COUNCIL_TERM_MS = FULMARA_COUNCIL_TERM_DAYS * 86_400_000;
export const FULMARA_LODESTAR_TERM_DAYS = 90;
export const FULMARA_LODESTAR_TERM_MS = FULMARA_LODESTAR_TERM_DAYS * 86_400_000;
export const FULMARA_TRIBUNE_SESSION_DAYS = 30;
export const FULMARA_TRIBUNE_SESSION_MS = FULMARA_TRIBUNE_SESSION_DAYS * 86_400_000;

function nextBoundary(nowMs: number, cycleMs: number): number {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
  const elapsed = Math.max(0, now - VARKAND_CHAIR_ANCHOR_MS);
  const step = Math.min(Math.floor(elapsed / cycleMs), Math.floor(Number.MAX_SAFE_INTEGER / cycleMs) - 1);
  return VARKAND_CHAIR_ANCHOR_MS + (step + 1) * cycleMs;
}

/** Next Council of Ten election, in integer milliseconds. At a boundary the following term is next. Before the anchor, the first election is one term after the anchor. */
export function fulmaraNextCouncilOfTenElectionAt(nowMs: number): number {
  return nextBoundary(nowMs, FULMARA_COUNCIL_TERM_MS);
}

/** Next Lodestar election, in integer milliseconds. At a boundary the following 90-day term is next. Before the anchor, the first election is one term after the anchor. */
export function fulmaraNextLodestarElectionAt(nowMs: number): number {
  return nextBoundary(nowMs, FULMARA_LODESTAR_TERM_MS);
}

/** End of the current Tribune session, in integer milliseconds. At a boundary the following session is current. Before the anchor, the first session ends one session after the anchor. */
export function fulmaraTribuneSessionEndsAt(nowMs: number): number {
  return nextBoundary(nowMs, FULMARA_TRIBUNE_SESSION_MS);
}
