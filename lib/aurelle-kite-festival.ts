/** #1243: Aurelle next Kite Festival on the government read. Pure: no database, so no migration.
 *  [ASSUMPTION] Docs §17.1: Aurelle's Kite Festival each game spring. Seasons rotate every 7.5 real days
 *  and spring is first (lib/game-season.ts: spring begins at the epoch). Offset 0 from
 *  VARKAND_CHAIR_ANCHOR_MS on the realDaysPerGameYear cycle is that spring start, the same instant
 *  as Hearth Night. An exact boundary rolls forward. Before the anchor, the next date is one cycle later.
 *  The shard world_clock epoch is per shard, so this read does not follow it. No kite duel, winner, or prize. */
import { realDaysPerGameYear } from './election-calendars.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from './varkand-directorate.ts';

const DAY_MS = 86_400_000;

/** [ASSUMPTION] Once per game year, at the start of game spring (offset 0). Tests pin this to realDaysPerGameYear (30). */
export const AURELLE_KITE_FESTIVAL_CYCLE_DAYS = realDaysPerGameYear;
export const AURELLE_KITE_FESTIVAL_CYCLE_MS = AURELLE_KITE_FESTIVAL_CYCLE_DAYS * DAY_MS;
const maxStep = Math.floor(Number.MAX_SAFE_INTEGER / AURELLE_KITE_FESTIVAL_CYCLE_MS) - 1;

/** Next Kite Festival, in integer milliseconds. Holds no duel, winner, or prize. */
export function aurelleNextKiteFestivalAt(nowMs: number): number {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
  const elapsed = Math.max(0, now - VARKAND_CHAIR_ANCHOR_MS);
  const step = Math.min(Math.floor(elapsed / AURELLE_KITE_FESTIVAL_CYCLE_MS), maxStep);
  return VARKAND_CHAIR_ANCHOR_MS + (step + 1) * AURELLE_KITE_FESTIVAL_CYCLE_MS;
}
