/** #1207: Varkand next Rotation Day on the government read (docs §7.8). Pure: no database, so no migration.
 *  Returns only the next date. No Chair name and no ceremony text.
 *  Reuses the Chair rotation term from #1085: VARKAND_ROTATION_MS is 60 real days (2 game years)
 *  from VARKAND_CHAIR_ANCHOR_MS. At a boundary the following rotation is next. Before the anchor,
 *  the next Rotation Day is one term after the anchor. Red Alert cancellation is not decided here. */
import { VARKAND_ROTATION_MS, varkandChairAt } from './varkand-directorate.ts';

const DAY_MS = 86_400_000;

/** The existing Chair term. Docs §7.8: every 2 game years (60 real days). Not a new cadence. */
export const VARKAND_ROTATION_DAY_CYCLE_DAYS = VARKAND_ROTATION_MS / DAY_MS;
export const VARKAND_ROTATION_DAY_CYCLE_MS = VARKAND_ROTATION_MS;

/** Next Rotation Day, in integer milliseconds. The same instant as varkandChairAt(nowMs).nextRotationAt. */
export function varkandNextRotationDayAt(nowMs: number): number {
  return varkandChairAt(nowMs).nextRotationAt;
}
