/** #1170: Korund next People's Congress. Pure: no database, so no migration.
 *  The Congress meets to approve, not to choose. This read stores only the next date.
 *  It holds no votes, motions, delegates, or outcomes, and names no persona.
 *  [ASSUMPTION] Docs §7.4 name People's Congress and give no interval. This clock is once
 *  per game year (30 real days) from VARKAND_CHAIR_ANCHOR_MS, with zero offset.
 *  [ASSUMPTION] The anchor is the Unix epoch from the Varkand Chair (#1087). This function takes
 *  only nowMs. The shard world_clock epoch is per shard, so this read does not follow it.
 *  [ASSUMPTION] Docs give the ceremony no length, so this read stores no window.
 *  At a boundary the following congress is next. Before the anchor, the next congress is one cycle
 *  after the anchor. A real day is 86_400_000 ms. */
import { VARKAND_CHAIR_ANCHOR_MS } from './varkand-directorate.ts';

const DAY_MS = 86_400_000;

/** [ASSUMPTION] Once per game year: 30 real days from the Varkand anchor, zero offset. */
export const KORUND_PEOPLES_CONGRESS_CYCLE_DAYS = 30 as const;
export const KORUND_PEOPLES_CONGRESS_CYCLE_MS = KORUND_PEOPLES_CONGRESS_CYCLE_DAYS * DAY_MS;
const maxStep = Math.floor(Number.MAX_SAFE_INTEGER / KORUND_PEOPLES_CONGRESS_CYCLE_MS) - 1;

/** Next People's Congress, in integer milliseconds. */
export function korundNextPeoplesCongressAt(nowMs: number): number {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
  const elapsed = Math.max(0, now - VARKAND_CHAIR_ANCHOR_MS);
  const step = Math.min(Math.floor(elapsed / KORUND_PEOPLES_CONGRESS_CYCLE_MS), maxStep);
  return VARKAND_CHAIR_ANCHOR_MS + (step + 1) * KORUND_PEOPLES_CONGRESS_CYCLE_MS;
}
