/** #1098: Federal Council of 7, a 120-real-day term, and a ceremonial Council Speaker every 30 real days.
 *  Pure: no database, so no migration. The election, ballots, and persona names are out of scope.
 *  [ASSUMPTION] Both clocks reuse VARKAND_CHAIR_ANCHOR_MS from #1085 (the Unix epoch). A real day is
 *  86_400_000 ms, so 120 and 30 real days are fixed multiples, not calendar months.
 *  [ASSUMPTION] Speaker seniority is the seat index. Seat 0 holds the Speakership at the anchor, then
 *  1 through 6, then 0 again. The seat does not reset when a Council term ends. */
import { VARKAND_CHAIR_ANCHOR_MS } from './varkand-directorate.ts';

export const VELDWOOD_COUNCIL_TERM_DAYS = 120;
export const VELDWOOD_COUNCIL_TERM_MS = VELDWOOD_COUNCIL_TERM_DAYS * 86_400_000;
export const VELDWOOD_SPEAKER_ROTATION_DAYS = 30;
export const VELDWOOD_SPEAKER_ROTATION_MS = VELDWOOD_SPEAKER_ROTATION_DAYS * 86_400_000;
export const VELDWOOD_COUNCIL_SEATS = 7;
const electionMaxStep = Math.floor(Number.MAX_SAFE_INTEGER / VELDWOOD_COUNCIL_TERM_MS) - 1;
const speakerMaxStep = Math.floor(Number.MAX_SAFE_INTEGER / VELDWOOD_SPEAKER_ROTATION_MS) - 1;

function elapsedSteps(nowMs: number, periodMs: number, maxStep: number): number {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
  const elapsed = Math.max(0, now - VARKAND_CHAIR_ANCHOR_MS);
  return Math.min(Math.floor(elapsed / periodMs), maxStep);
}

/** Next Federal Council election, in integer milliseconds. At a boundary the following term is next. Before the anchor, the first election is one term after the anchor. */
export function veldwoodNextCouncilElectionAt(nowMs: number): number {
  const step = elapsedSteps(nowMs, VELDWOOD_COUNCIL_TERM_MS, electionMaxStep);
  return VARKAND_CHAIR_ANCHOR_MS + (step + 1) * VELDWOOD_COUNCIL_TERM_MS;
}

/** Ceremonial Council Speaker seat, 0 through 6. Before the anchor, seat 0 still holds the Speakership. */
export function veldwoodCouncilSpeakerSeat(nowMs: number): number {
  return elapsedSteps(nowMs, VELDWOOD_SPEAKER_ROTATION_MS, speakerMaxStep) % VELDWOOD_COUNCIL_SEATS;
}
