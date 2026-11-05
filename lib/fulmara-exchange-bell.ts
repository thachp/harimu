/** #1150: Exchange Bell once per game year. Pure: no database, so no migration.
 *  The read opens no trading session, moves no prices, and lists no trades.
 *  [ASSUMPTION] Docs §7.10 name the Exchange Bell as the year's opening of trading and give no interval.
 *  A game year is 30 real days (docs §17.1: 1 real month = 1 game year). The cycle reuses
 *  VARKAND_CHAIR_ANCHOR_MS from #1085 (the Unix epoch). A real day is 86_400_000 ms, so 30 real days
 *  is a fixed multiple, not a calendar month. */
import { VARKAND_CHAIR_ANCHOR_MS } from './varkand-directorate.ts';

export const FULMARA_EXCHANGE_BELL_CYCLE_DAYS = 30;
export const FULMARA_EXCHANGE_BELL_MS = FULMARA_EXCHANGE_BELL_CYCLE_DAYS * 86_400_000;
const maxStep = Math.floor(Number.MAX_SAFE_INTEGER / FULMARA_EXCHANGE_BELL_MS) - 1;

/** Next Exchange Bell, in integer milliseconds. At a boundary the following cycle is next. Before the anchor, the first Exchange Bell is one cycle after the anchor. */
export function fulmaraNextExchangeBellAt(nowMs: number): number {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
  const elapsed = Math.max(0, now - VARKAND_CHAIR_ANCHOR_MS);
  const step = Math.min(Math.floor(elapsed / FULMARA_EXCHANGE_BELL_MS), maxStep);
  return VARKAND_CHAIR_ANCHOR_MS + (step + 1) * FULMARA_EXCHANGE_BELL_MS;
}
