/** #1191: Aurelle next Coronation Day on the government read (docs §7.5). Pure: no database, so no migration.
 *  Date only: no rite text, Privy Council roster, or Crown debasement figures.
 *  [ASSUMPTION] Docs name Coronation Day and give no interval. Cadence is once per game year = realDaysPerGameYear
 *  (30 real days) from VARKAND_CHAIR_ANCHOR_MS (#1085). Zero offset from that anchor.
 *  A real day is 86_400_000 ms. At a boundary the following day is next. Before the anchor, the next
 *  Coronation Day is one cycle after the anchor. The shard world_clock epoch is per shard, so this read does not follow it. */
import { realDaysPerGameYear } from './election-calendars.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from './varkand-directorate.ts';

const DAY_MS = 86_400_000;

/** [ASSUMPTION] Once per game year, zero offset from the Chair anchor. Tests pin this to realDaysPerGameYear (30). */
export const AURELLE_CORONATION_DAY_CYCLE_DAYS = realDaysPerGameYear;
export const AURELLE_CORONATION_DAY_CYCLE_MS = AURELLE_CORONATION_DAY_CYCLE_DAYS * DAY_MS;
const maxStep = Math.floor(Number.MAX_SAFE_INTEGER / AURELLE_CORONATION_DAY_CYCLE_MS) - 1;

/** Next Coronation Day, in integer milliseconds. States no rite. */
export function aurelleNextCoronationDayAt(nowMs: number): number {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
  const elapsed = Math.max(0, now - VARKAND_CHAIR_ANCHOR_MS);
  const step = Math.min(Math.floor(elapsed / AURELLE_CORONATION_DAY_CYCLE_MS), maxStep);
  return VARKAND_CHAIR_ANCHOR_MS + (step + 1) * AURELLE_CORONATION_DAY_CYCLE_MS;
}
