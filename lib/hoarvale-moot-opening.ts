/** #1208: Hoarvale next Opening of the Moot. Pure integer ms. No database, so no migration.
 *  The read holds the next date only: no Kinward Rite text and no Moot member names.
 *  [ASSUMPTION] Docs §7 and the #1096 term helpers give no offset between a term start and the Opening, so the offset is 0.
 *  The next Opening is the start of the next Moot term after nowMs, from hoarvaleMootAt (MOOT_TERM_SECONDS). This file does not restate the 120-day cadence.
 *  At an exact term boundary the following term is next, because hoarvaleMootAt treats dissolvesBy as the start of the new term.
 *  Before the anchor, hoarvaleMootAt clamps to 0, so the next Opening is one term after the anchor. Takes nowMs only. */
import { MOOT_TERM_SECONDS, hoarvaleMootAt } from './government.ts';

/** [ASSUMPTION] Zero milliseconds between the term start and the Opening. */
export const HOARVALE_MOOT_OPENING_OFFSET_MS = 0;

/** Next Opening of the Moot, in integer milliseconds. Takes nowMs only. */
export function hoarvaleNextMootOpeningAt(nowMs: number): number {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : 0;
  const seconds = now > 0 ? Math.floor(now / 1000) : 0;
  const term = hoarvaleMootAt(Number.isSafeInteger(seconds) ? seconds : 0);
  const nextMs = term.dissolvesBy * 1000 + HOARVALE_MOOT_OPENING_OFFSET_MS;
  if (Number.isSafeInteger(nextMs)) return nextMs;
  const termMs = MOOT_TERM_SECONDS * 1000;
  return Math.floor(Number.MAX_SAFE_INTEGER / termMs) * termMs;
}
