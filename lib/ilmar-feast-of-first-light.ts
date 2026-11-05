/** #1137: Ilmar next Feast of First Light. Pure: no database, so no migration.
 *  Choosing an Oracle, listing clergy, and spending are out of scope.
 *  [ASSUMPTION] Docs §7.6 tie the feast to a new Oracle or a solstice and give no dates.
 *  Issue #1137 states the only cadence this clock uses: twice per game year, every 15 real days,
 *  from a Unix-epoch style anchor standing in for the two solstices. No other interval is added.
 *  [ASSUMPTION] The Unix-epoch anchor is VARKAND_CHAIR_ANCHOR_MS from #1085. This function takes
 *  only nowMs. The shard world_clock epoch is per shard, so this read does not follow it.
 *  [ASSUMPTION] Docs give the feast no length, so this read stores no window.
 *  [ASSUMPTION] Docs give no Oracle-choice interval. Oracle succession is out of scope, so this
 *  clock does not add a second feast. At a boundary the following feast is next, the same
 *  next-cycle rule as #1107. Before the anchor, the next feast is one cycle after the anchor.
 *  A real day is 86_400_000 ms. */
import { VARKAND_CHAIR_ANCHOR_MS } from './varkand-directorate.ts';

const DAY_MS = 86_400_000;

/** Twice per game year, every 15 real days. Issue #1137 states this interval. */
export const ILMAR_FEAST_OF_FIRST_LIGHT_CYCLE_DAYS = 15 as const;
export const ILMAR_FEAST_OF_FIRST_LIGHT_CYCLE_MS = ILMAR_FEAST_OF_FIRST_LIGHT_CYCLE_DAYS * DAY_MS;
const maxStep = Math.floor(Number.MAX_SAFE_INTEGER / ILMAR_FEAST_OF_FIRST_LIGHT_CYCLE_MS) - 1;

/** Next Feast of First Light, in integer milliseconds. */
export function ilmarNextFeastOfFirstLightAt(nowMs: number): number {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
  const elapsed = Math.max(0, now - VARKAND_CHAIR_ANCHOR_MS);
  const step = Math.min(Math.floor(elapsed / ILMAR_FEAST_OF_FIRST_LIGHT_CYCLE_MS), maxStep);
  return VARKAND_CHAIR_ANCHOR_MS + (step + 1) * ILMAR_FEAST_OF_FIRST_LIGHT_CYCLE_MS;
}
