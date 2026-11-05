/** #1113: Party Congress every 150 real days (5 game years). Pure: no database, so no migration.
 *  Electing Pillar holders, the Central Committee, the Politburo, Assembly ballots, and the age cap are out of scope.
 *  [ASSUMPTION] The cycle reuses VARKAND_CHAIR_ANCHOR_MS from #1085 (the Unix epoch). A real day is
 *  86_400_000 ms, so 150 real days is a fixed multiple, not five calendar months. Docs call that span
 *  5 game years; realDaysPerGameYear is 30, and 5 × 30 = 150. This clock does not call the Mandate Plebiscite. */
import { VARKAND_CHAIR_ANCHOR_MS } from './varkand-directorate.ts';

export const CONFLUENCE_PILLARS = ['general_secretary', 'president', 'premier', 'assembly_chair'] as const;
export const CONFLUENCE_TERM_LIMIT_CONGRESSES = 2 as const;
export const CONFLUENCE_CONGRESS_INTERVAL_DAYS = 150;
export const CONFLUENCE_CONGRESS_MS = CONFLUENCE_CONGRESS_INTERVAL_DAYS * 86_400_000;
const maxStep = Math.floor(Number.MAX_SAFE_INTEGER / CONFLUENCE_CONGRESS_MS) - 1;

/** Next Party Congress, in integer milliseconds. At a boundary the following cycle is next. Before the anchor, the first Congress is one cycle after the anchor. */
export function confluenceNextPartyCongressAt(nowMs: number): number {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
  const elapsed = Math.max(0, now - VARKAND_CHAIR_ANCHOR_MS);
  const step = Math.min(Math.floor(elapsed / CONFLUENCE_CONGRESS_MS), maxStep);
  return VARKAND_CHAIR_ANCHOR_MS + (step + 1) * CONFLUENCE_CONGRESS_MS;
}
