/** #1175: Meridian next Turbine Day on the government read (docs §7.3). Pure: no database, so no migration.
 *  Holds no grid output, power figure, or bonus. Shen Springs hosts the anniversary; this read stores the next date and that city.
 *  [ASSUMPTION] Docs §7.3 call Turbine Day the anniversary of the national grid and give no interval.
 *  Cadence is once per game year (30 real days) from VARKAND_CHAIR_ANCHOR_MS (#1085), with no anniversary offset.
 *  A real day is 86_400_000 ms, so 30 real days is a fixed multiple, not a calendar month.
 *  At a boundary the following cycle is next. Before the anchor, the next Turbine Day is one cycle after the anchor. */
import { VARKAND_CHAIR_ANCHOR_MS } from './varkand-directorate.ts';

export const MERIDIAN_TURBINE_DAY_CYCLE_DAYS = 30;
export const MERIDIAN_TURBINE_DAY_MS = MERIDIAN_TURBINE_DAY_CYCLE_DAYS * 86_400_000;
export const MERIDIAN_TURBINE_DAY_HOST = 'Shen Springs' as const;
const maxStep = Math.floor(Number.MAX_SAFE_INTEGER / MERIDIAN_TURBINE_DAY_MS) - 1;

/** Next Turbine Day, in integer milliseconds. At a boundary the following cycle is next. Before the anchor, the first Turbine Day is one cycle after the anchor. */
export function meridianNextTurbineDayAt(nowMs: number): number {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
  const elapsed = Math.max(0, now - VARKAND_CHAIR_ANCHOR_MS);
  const step = Math.min(Math.floor(elapsed / MERIDIAN_TURBINE_DAY_MS), maxStep);
  return VARKAND_CHAIR_ANCHOR_MS + (step + 1) * MERIDIAN_TURBINE_DAY_MS;
}
