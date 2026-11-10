/** #1245: Ilmar next Clearing (Lumen Canon new year) on the government read. Pure: no database, so no migration.
 *  The helper stores nothing and returns only the next date. No vows, Piety changes, or clergy lists.
 *  Docs §14.1 Festivals (game time), Lumen Canon: "Long Light (midsummer vigil); Clearing (new-year renewal of vows)"
 *  (https://docs.harimu.com/religion/religion-faiths/).
 *  Docs §7.6 Religion: "Theocracy – the Lumen Canon is the state faith, with public duties (Vigil, Stilldays)."
 *  (https://docs.harimu.com/world/nations/ilmar-sanctum/).
 *  Docs §14.2 Ilmar: "Theocracy – state faith compulsory in public" (https://docs.harimu.com/religion/religion-faiths/).
 *  Culture bible, Ilmar Sanctum: "Festivals: Stilldays, Great Pilgrimage, Long Light, Clearing."
 *  (https://docs.harimu.com/world/culture-bible/).
 *  Docs §17.1 The World Clock: "1 real month (30 days) = 1 game year" (https://docs.harimu.com/systems/world-clock-pacing/).
 *  [ASSUMPTION] "new-year" is the game-year boundary (offset 0), the same instant as the other yearly nation clocks. Accepted on #1245.
 *  [ASSUMPTION] This is the Sanctum's state observance of a Lumen Canon festival, so it lives on Ilmar's read only. Accepted on #1245.
 *  Cadence is once per game year = realDaysPerGameYear (30 real days) from VARKAND_CHAIR_ANCHOR_MS (#1085).
 *  A real day is 86_400_000 ms. At a boundary the following year is next. Before the anchor, the next
 *  Clearing is one cycle after the anchor. The shard world_clock epoch is per shard, so this read does not follow it. */
import { realDaysPerGameYear } from './election-calendars.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from './varkand-directorate.ts';

const DAY_MS = 86_400_000;

/** [ASSUMPTION] Once per game year, zero offset from the Chair anchor. Tests pin this to realDaysPerGameYear (30). */
export const ILMAR_CLEARING_CYCLE_DAYS = realDaysPerGameYear;
export const ILMAR_CLEARING_CYCLE_MS = ILMAR_CLEARING_CYCLE_DAYS * DAY_MS;
const maxStep = Math.floor(Number.MAX_SAFE_INTEGER / ILMAR_CLEARING_CYCLE_MS) - 1;

/** Next Clearing, in integer milliseconds. Returns only the next date. */
export function ilmarNextClearingAt(nowMs: number): number {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
  const elapsed = Math.max(0, now - VARKAND_CHAIR_ANCHOR_MS);
  const step = Math.min(Math.floor(elapsed / ILMAR_CLEARING_CYCLE_MS), maxStep);
  return VARKAND_CHAIR_ANCHOR_MS + (step + 1) * ILMAR_CLEARING_CYCLE_MS;
}
