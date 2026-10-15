/** Korund gray market PoC (#43): the pure rules. Behind HARIMU_GRAY_MARKET_ENABLED (off). No imports.
 *
 * The other side of a trade is "FC": smuggled foreign cash, a Korund-only off-book unit (ARC, option A). FC is never
 * convertible: not into Labor Notes except through an accepted trade here, not into any official settlement, not into Tessera.
 * Money is in minor units (100 = 1.00). An offer sells `amountMinor` Labor Notes (LN) for FC at an asking rate; the rate is
 * stored in hundredths of an FC per LN (ask_rate 110 = 1.10 FC per LN), so the FC price is ceil(amount x rate / 100).
 * Every number marked [ASSUMPTION] is a placeholder the docs do not give. */
export const GRAY_AMOUNT_CAP_MINOR = 5000;          // issue #43 scope: cap per offer, in minor LN
export const GRAY_OFFER_GAME_DAYS = 2;              // [ASSUMPTION] offers expire after 2 game days
export const GAME_DAY_SECONDS = 7200;               // 1 game day = 2 real hours (12x time)
export const GRAY_OFFER_LIFETIME_SECONDS = GRAY_OFFER_GAME_DAYS * GAME_DAY_SECONDS;
export const GRAY_RUMOR_TRADES = 5;                 // rumored rate = average of the last 5 accepted trades ...
export const GRAY_RUMOR_WINDOW_SECONDS = 7 * GAME_DAY_SECONDS; // ... within the last 7 game days ...
export const GRAY_RUMOR_NOISE = 0.1;                // ... with +/-10% seeded noise [ASSUMPTION: no rumor until a trade exists]
export const GRAY_STARTING_GRANT_MINOR = 1000;      // [ASSUMPTION] one small one-time grant of 10.00 FC per Korund citizen
export const GRAY_RUMOR_NUDGE = 0.01;              // [ASSUMPTION] when the noisy figure equals the last trade's rate, move it by at least 1% of that rate (floor: 1 hundredth)
export const GRAY_RATE_MIN = 1;                     // validation bounds only (0.01 .. 100.00 FC per LN), not a market view
export const GRAY_RATE_MAX = 10000;

export type GrayOfferInput = { amountMinor: number; askRate: number };
/** The offer terms, or null when they are not whole numbers inside the bounds. */
export function validGrayOffer(body: { amountMinor?: unknown; askRate?: unknown }): GrayOfferInput | null {
  const { amountMinor, askRate } = body;
  if (!Number.isSafeInteger(amountMinor) || (amountMinor as number) < 1 || (amountMinor as number) > GRAY_AMOUNT_CAP_MINOR) return null;
  if (!Number.isSafeInteger(askRate) || (askRate as number) < GRAY_RATE_MIN || (askRate as number) > GRAY_RATE_MAX) return null;
  return { amountMinor: amountMinor as number, askRate: askRate as number };
}
/** FC price of an offer, fixed when it is posted. */
export const grayCashFor = (amountMinor: number, askRate: number): number => Math.ceil(amountMinor * askRate / 100);

/** FNV-1a, 32 bit: the deterministic seed for the rumor noise, so a reload shows the same rumor within a game day. */
export function graySeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
export type GrayTradePoint = { offerId: string; askRate: number; tradedAt: number };
/** The rumored street rate (hundredths of FC per LN), or null while no accepted trade is inside the window.
 * Average of the latest 5 trades within 7 game days, times 1 +/- 10% seeded noise (seed = latest trade + game day). It is never exactly the
 * last trade's rate: when rounding lands on it, the rumor is moved one step. */
export function rumoredRate(trades: readonly GrayTradePoint[], now: number): number | null {
  const recent = trades.filter(t => t.tradedAt <= now && t.tradedAt >= now - GRAY_RUMOR_WINDOW_SECONDS)
    .sort((a, b) => b.tradedAt - a.tradedAt || (a.offerId < b.offerId ? 1 : -1)).slice(0, GRAY_RUMOR_TRADES);
  if (!recent.length) return null;
  const latest = recent[0];
  const average = recent.reduce((sum, t) => sum + t.askRate, 0) / recent.length;
  const u = graySeed(`${latest.offerId}:${Math.floor(now / GAME_DAY_SECONDS)}`) / 0x100000000;
  let rate = Math.min(GRAY_RATE_MAX, Math.max(GRAY_RATE_MIN, Math.round(average * (1 + GRAY_RUMOR_NOISE * (2 * u - 1)))));
  if (rate === latest.askRate) {
    const step = Math.max(1, Math.round(latest.askRate * GRAY_RUMOR_NUDGE)), down = latest.askRate - step;
    rate = (u < 0.5 && down >= GRAY_RATE_MIN) || latest.askRate + step > GRAY_RATE_MAX ? down : latest.askRate + step;
  }
  return rate;
}
