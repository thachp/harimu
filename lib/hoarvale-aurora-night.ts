/** #1160: Hoarvale next Aurora Night. Pure: no database, so no migration.
 *  Holds no festival, adds no rest bonus, and names no persona. Isling Springs hosts the night;
 *  this read stores only the next date.
 *  [ASSUMPTION] Docs §7.7 call Aurora Night midwinter and give no interval. This clock is once
 *  per game year (30 real days) from VARKAND_CHAIR_ANCHOR_MS, with no midwinter offset.
 *  [ASSUMPTION] The anchor is the Unix epoch from the Varkand Chair (#1087). This function takes
 *  only nowMs. The shard world_clock epoch is per shard, so this read does not follow it.
 *  [ASSUMPTION] Docs give the holiday no length, so this read stores no window.
 *  At a boundary the following night is next. Before the anchor, the next night is one cycle
 *  after the anchor. A real day is 86_400_000 ms. */
import { VARKAND_CHAIR_ANCHOR_MS } from './varkand-directorate.ts';

const DAY_MS = 86_400_000;

/** [ASSUMPTION] Once per game year: 30 real days from the Varkand anchor, no midwinter offset. */
export const HOARVALE_AURORA_NIGHT_CYCLE_DAYS = 30 as const;
export const HOARVALE_AURORA_NIGHT_CYCLE_MS = HOARVALE_AURORA_NIGHT_CYCLE_DAYS * DAY_MS;
const maxStep = Math.floor(Number.MAX_SAFE_INTEGER / HOARVALE_AURORA_NIGHT_CYCLE_MS) - 1;

/** Next Aurora Night, in integer milliseconds. */
export function hoarvaleNextAuroraNightAt(nowMs: number): number {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
  const elapsed = Math.max(0, now - VARKAND_CHAIR_ANCHOR_MS);
  const step = Math.min(Math.floor(elapsed / HOARVALE_AURORA_NIGHT_CYCLE_MS), maxStep);
  return VARKAND_CHAIR_ANCHOR_MS + (step + 1) * HOARVALE_AURORA_NIGHT_CYCLE_MS;
}
