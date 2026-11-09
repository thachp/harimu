/** #1219. Pure integer ms. [ASSUMPTION] Docs §7.7 and #1096 give no offset, so Election Night is
 *  dissolvesBy from hoarvaleMootAt. An exact boundary rolls forward. Before the anchor the term clamps to 0. */
import { MOOT_TERM_SECONDS, hoarvaleMootAt } from './hoarvale-moot.ts';
/** [ASSUMPTION] Zero milliseconds between the term boundary and Election Night. */
export const HOARVALE_ELECTION_NIGHT_OFFSET_MS = 0;

export function hoarvaleNextElectionNightAt(nowMs: number): number {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : 0;
  const seconds = now > 0 ? Math.floor(now / 1000) : 0;
  const term = hoarvaleMootAt(Number.isSafeInteger(seconds) ? seconds : 0);
  const nextMs = term.dissolvesBy * 1000 + HOARVALE_ELECTION_NIGHT_OFFSET_MS;
  if (Number.isSafeInteger(nextMs)) return nextMs;
  const termMs = MOOT_TERM_SECONDS * 1000;
  return Math.floor(Number.MAX_SAFE_INTEGER / termMs) * termMs;
}
