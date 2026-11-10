/** #1260: Ilmar next Long Light midsummer vigil on the government read (docs §14.1, §17.1). Pure: no database, so no migration.
 *  Holds the next date only. No vigil, vows, Piety changes, or clergy lists.
 *  [ASSUMPTION] Midsummer is 11.25 real days = 972_000_000 ms into the 30-day year from VARKAND_CHAIR_ANCHOR_MS
 *  (summer starts at 7.5 days, plus half a season). Same offset as #1244 Ring Moot; accepted by Architect on #1260.
 *  [ASSUMPTION] This is the Sanctum's state observance of a Lumen Canon festival, so it lives on Ilmar's read only.
 *  Cadence is once per game year = realDaysPerGameYear (30 real days). At a boundary the following date is next.
 *  Before the anchor, the next date is the first one after the anchor (anchor + offset).
 *  A real day is 86_400_000 ms. The shard world_clock epoch is per shard, so this read does not follow it. */
import { realDaysPerGameYear } from './election-calendars.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from './varkand-directorate.ts';

const DAY_MS = 86_400_000;

/** [ASSUMPTION] Once per game year. Tests pin this to realDaysPerGameYear (30). */
export const ILMAR_LONG_LIGHT_CYCLE_DAYS = realDaysPerGameYear;
export const ILMAR_LONG_LIGHT_CYCLE_MS = ILMAR_LONG_LIGHT_CYCLE_DAYS * DAY_MS;
/** [ASSUMPTION] Midsummer offset: 11.25 real days into the year (Architect-accepted on #1260, same as #1244). */
export const ILMAR_LONG_LIGHT_OFFSET_MS = 972_000_000;
const maxStep = Math.floor(Number.MAX_SAFE_INTEGER / ILMAR_LONG_LIGHT_CYCLE_MS) - 1;

/** Next Long Light, in integer milliseconds. Date only. */
export function ilmarNextLongLightAt(nowMs: number): number {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
  const first = VARKAND_CHAIR_ANCHOR_MS + ILMAR_LONG_LIGHT_OFFSET_MS;
  if (now < first) return first;
  const elapsed = now - first;
  const step = Math.min(Math.floor(elapsed / ILMAR_LONG_LIGHT_CYCLE_MS), maxStep);
  return first + (step + 1) * ILMAR_LONG_LIGHT_CYCLE_MS;
}
