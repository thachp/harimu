/** #1212: Ilmar next Assembly Election day. Pure: no database, so no migration.
 *  Date only: no candidates, results, ballot state, or Synod roster.
 *  Docs §9.6: Assembly of the Faithful every 120 days. §17 lists elections (120) as real time.
 *  [ASSUMPTION] No anniversary offset; reuses VARKAND_CHAIR_ANCHOR_MS (#1085). A real day is 86_400_000 ms. */
import { VARKAND_CHAIR_ANCHOR_MS } from './varkand-directorate.ts';

export const ILMAR_ASSEMBLY_ELECTION_DAY_CYCLE_DAYS = 120 as const;
export const ILMAR_ASSEMBLY_ELECTION_DAY_CYCLE_MS = ILMAR_ASSEMBLY_ELECTION_DAY_CYCLE_DAYS * 86_400_000;
const maxStep = Math.floor(Number.MAX_SAFE_INTEGER / ILMAR_ASSEMBLY_ELECTION_DAY_CYCLE_MS) - 1;

/** Next Assembly Election day, integer ms. At a boundary the following cycle is next. Before the anchor, next is one cycle after it. */
export function ilmarNextAssemblyElectionDayAt(nowMs: number): number {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
  const elapsed = Math.max(0, now - VARKAND_CHAIR_ANCHOR_MS);
  const step = Math.min(Math.floor(elapsed / ILMAR_ASSEMBLY_ELECTION_DAY_CYCLE_MS), maxStep);
  return VARKAND_CHAIR_ANCHOR_MS + (step + 1) * ILMAR_ASSEMBLY_ELECTION_DAY_CYCLE_MS;
}
