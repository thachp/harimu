/** #1164: Kindle next Market Bell on the government read (docs §7.1). Pure: no database, so no migration.
 *  Holds no market event, moves no prices, and adds no bonus. Forgehaven's Exchange hosts the anniversary;
 *  this read stores only the next date.
 *  [ASSUMPTION] Docs §7.1 call Market Bell the stock-exchange opening anniversary and give no interval.
 *  Cadence is once per game year (30 real days) from VARKAND_CHAIR_ANCHOR_MS (#1085), with no anniversary offset.
 *  Architect accepted that cadence. A real day is 86_400_000 ms, so 30 real days is a fixed multiple, not a calendar month.
 *  At a boundary the following cycle is next. Before the anchor, the next Market Bell is one cycle after the anchor. */
import { VARKAND_CHAIR_ANCHOR_MS } from './varkand-directorate.ts';

export const KINDLE_MARKET_BELL_CYCLE_DAYS = 30;
export const KINDLE_MARKET_BELL_MS = KINDLE_MARKET_BELL_CYCLE_DAYS * 86_400_000;
const maxStep = Math.floor(Number.MAX_SAFE_INTEGER / KINDLE_MARKET_BELL_MS) - 1;

/** Next Market Bell, in integer milliseconds. At a boundary the following cycle is next. Before the anchor, the first Market Bell is one cycle after the anchor. */
export function kindleNextMarketBellAt(nowMs: number): number {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
  const elapsed = Math.max(0, now - VARKAND_CHAIR_ANCHOR_MS);
  const step = Math.min(Math.floor(elapsed / KINDLE_MARKET_BELL_MS), maxStep);
  return VARKAND_CHAIR_ANCHOR_MS + (step + 1) * KINDLE_MARKET_BELL_MS;
}
