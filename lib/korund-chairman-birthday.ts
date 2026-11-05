/** #1147: Korund next Chairman's Birthday. Pure: no database, so no migration.
 *  Naming a Chairman, awarding medals, and spending are out of scope.
 *  [ASSUMPTION] Docs §7.4 list Chairman's Birthday and give no interval. This clock
 *  uses once per game year (30 real days).
 *  [ASSUMPTION] The anchor is VARKAND_CHAIR_ANCHOR_MS, the Unix epoch from the Varkand
 *  Chair (#1087). This function takes only nowMs. The shard world_clock epoch is per
 *  shard, so this read does not follow it.
 *  [ASSUMPTION] Docs give the holiday no length, so this read stores no window.
 *  At a boundary the following birthday is next. Before the anchor, the next birthday
 *  is one cycle after the anchor. A real day is 86_400_000 ms. */
import { VARKAND_CHAIR_ANCHOR_MS } from './varkand-directorate.ts';

const DAY_MS = 86_400_000;

/** [ASSUMPTION] Once per game year: 30 real days. Docs give no interval. */
export const KORUND_CHAIRMAN_BIRTHDAY_CYCLE_DAYS = 30 as const;
export const KORUND_CHAIRMAN_BIRTHDAY_CYCLE_MS = KORUND_CHAIRMAN_BIRTHDAY_CYCLE_DAYS * DAY_MS;
const maxStep = Math.floor(Number.MAX_SAFE_INTEGER / KORUND_CHAIRMAN_BIRTHDAY_CYCLE_MS) - 1;

/** Next Chairman's Birthday, in integer milliseconds. */
export function korundNextChairmanBirthdayAt(nowMs: number): number {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
  const elapsed = Math.max(0, now - VARKAND_CHAIR_ANCHOR_MS);
  const step = Math.min(Math.floor(elapsed / KORUND_CHAIRMAN_BIRTHDAY_CYCLE_MS), maxStep);
  return VARKAND_CHAIR_ANCHOR_MS + (step + 1) * KORUND_CHAIRMAN_BIRTHDAY_CYCLE_MS;
}
