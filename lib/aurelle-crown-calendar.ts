/** #1118: Aurelle reign-start display clock and the next Great Council window.
 *  Pure: no database, so no migration. Naming an heir, opening the Council, and spending are out of scope.
 *  [ASSUMPTION] The docs give the Great Council no sitting interval (it elects a house only when no eligible
 *  heir remains). The display reign is the lower bound of the scripted mortality window already in
 *  AURELLE_CALENDAR: mortalityGameAge[0] game years × realDaysPerGameYear (70 × 30 = 2100 real days).
 *  The next Great Council window opens when that display reign ends. This read does not convene it.
 *  [ASSUMPTION] Succession events store crownedAt, not a fixed epoch, and the Kindle cycle start is per shard
 *  and fail-closed. Both clocks reuse VARKAND_CHAIR_ANCHOR_MS from the Varkand Chair rotation (#1087, #1085):
 *  the Unix epoch. A real day is 86_400_000 ms. At a boundary the following window is next and the display
 *  reign is treated as just having started. Before the anchor, the reign starts at the anchor. */
import { AURELLE_CALENDAR, realDaysPerGameYear } from './election-calendars.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from './varkand-directorate.ts';

const DAY_MS = 86_400_000;

export const AURELLE_REIGN_DISPLAY_DAYS = AURELLE_CALENDAR.mortalityGameAge[0] * realDaysPerGameYear;
export const AURELLE_REIGN_DISPLAY_MS = AURELLE_REIGN_DISPLAY_DAYS * DAY_MS;
const maxStep = Math.floor(Number.MAX_SAFE_INTEGER / AURELLE_REIGN_DISPLAY_MS) - 1;

function stepAt(nowMs: number): number {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
  const elapsed = Math.max(0, now - VARKAND_CHAIR_ANCHOR_MS);
  return Math.min(Math.floor(elapsed / AURELLE_REIGN_DISPLAY_MS), maxStep);
}

/** When the current display reign is treated as starting, in integer milliseconds. */
export function aurelleReignStartedAt(nowMs: number): number {
  return VARKAND_CHAIR_ANCHOR_MS + stepAt(nowMs) * AURELLE_REIGN_DISPLAY_MS;
}

/** When the next Great Council window opens, in integer milliseconds. At a boundary the following window is next. */
export function aurelleNextGreatCouncilWindowAt(nowMs: number): number {
  return VARKAND_CHAIR_ANCHOR_MS + (stepAt(nowMs) + 1) * AURELLE_REIGN_DISPLAY_MS;
}
