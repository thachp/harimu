/** #1096, docs §7.7 Government row: the Moot sits at most 120 real days; reserve powers only when no PM is invested within 7 real days.
 *  Integer seconds. Pure, so no migration. [ASSUMPTION] Terms run back to back from the Unix epoch (the Varkand #1085 anchor),
 *  so every election is a full-term one. [ASSUMPTION] No investiture is stored yet, so the rule-bound Moot invests its PM
 *  one real day after the election; hoarvaleMoot still takes any investedAt, so a later stored vote plugs in.
 *  Kept out of government.ts so the Opening and Election Night helpers can share the term clock without a circular import. */
export const MOOT_TERM_SECONDS = 120 * 86_400;
export const INVESTITURE_DEADLINE_SECONDS = 7 * 86_400;
export const MOOT_INVESTITURE_VOTE_SECONDS = 86_400;
export type HoarvaleMoot = { electedAt: number; dissolvesBy: number; primeMinisterInvestedAt: number | null; investitureDeadline: number; reservePowersAvailable: boolean };
export function hoarvaleMoot(electedAt: number, investedAt: number | null, now: number): HoarvaleMoot {
  const invested = investedAt != null && Number.isSafeInteger(investedAt) && investedAt >= electedAt && investedAt <= now ? investedAt : null;
  const investitureDeadline = electedAt + INVESTITURE_DEADLINE_SECONDS;
  return { electedAt, dissolvesBy: electedAt + MOOT_TERM_SECONDS, primeMinisterInvestedAt: invested, investitureDeadline,
    reservePowersAvailable: invested === null && now >= investitureDeadline };
}
/** The current term at `now` (seconds). At exactly dissolvesBy the next term has begun. */
export function hoarvaleMootAt(now: number): HoarvaleMoot {
  const t = Number.isSafeInteger(now) && now > 0 ? now : 0;
  const electedAt = Math.floor(t / MOOT_TERM_SECONDS) * MOOT_TERM_SECONDS;
  return hoarvaleMoot(electedAt, electedAt + MOOT_INVESTITURE_VOTE_SECONDS, t);
}
