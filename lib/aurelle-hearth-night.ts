/** #1146: Aurelle next Hearth Night (Kinward Rite blessing of houses) on the government read.
 *  Pure: no database, so no migration. Blessing houses, naming an heir, and spending are out of scope.
 *  [ASSUMPTION] Docs §7.5 list Hearth Night and give no interval. Cadence is once per game year =
 *  realDaysPerGameYear (30 real days) from VARKAND_CHAIR_ANCHOR_MS (#1085), the same Chair family
 *  as the other nation clocks. A real day is 86_400_000 ms. At a boundary the following night is next.
 *  Before the anchor, the next Hearth Night is one cycle after the anchor. The shard world_clock
 *  epoch is per shard, so this read does not follow it. */
import { realDaysPerGameYear } from './election-calendars.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from './varkand-directorate.ts';

const DAY_MS = 86_400_000;

/** [ASSUMPTION] Once per game year. Tests pin this to realDaysPerGameYear (30). */
export const AURELLE_HEARTH_NIGHT_CYCLE_DAYS = realDaysPerGameYear;
export const AURELLE_HEARTH_NIGHT_CYCLE_MS = AURELLE_HEARTH_NIGHT_CYCLE_DAYS * DAY_MS;
const maxStep = Math.floor(Number.MAX_SAFE_INTEGER / AURELLE_HEARTH_NIGHT_CYCLE_MS) - 1;

/** Next Hearth Night, in integer milliseconds. Blesses no houses. */
export function aurelleNextHearthNightAt(nowMs: number): number {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
  const elapsed = Math.max(0, now - VARKAND_CHAIR_ANCHOR_MS);
  const step = Math.min(Math.floor(elapsed / AURELLE_HEARTH_NIGHT_CYCLE_MS), maxStep);
  return VARKAND_CHAIR_ANCHOR_MS + (step + 1) * AURELLE_HEARTH_NIGHT_CYCLE_MS;
}
