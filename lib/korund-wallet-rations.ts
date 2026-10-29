/** #1055: Korund top-bar wallet shows this week's remaining food coupons (docs §23.1, §23.2).
 *  NEXT_PUBLIC_HARIMU_KORUND_WALLET_RATIONS is a HARIMU_UI_PACK key ("true" in preview, "false" in production).
 *  Layout bundles that omit the define have no `process`. A missing flag is off. */
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'] as const;
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'] as const;

/** The coupon fields already on the Korund plan. No new fields. */
export type KorundCouponView = { couponFoodRemaining: number; couponExpiresAt: string };
export type KorundRationLine = { remaining: number; words: string; expired: boolean; text: string };

export function korundWalletRationsFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_KORUND_WALLET_RATIONS; }
  catch { return undefined; }
}
export function korundWalletRationsEnabled(value: string | undefined = korundWalletRationsFlag()): boolean {
  return value === 'true';
}

/** Accessible count. 0–999 only; the plan's food coupons are a small whole number. */
export function couponCountWords(count: number): string {
  if (count < 20) return ONES[count];
  if (count < 100) { const tail = count % 10; return tail ? `${TENS[Math.floor(count / 10)]} ${ONES[tail]}` : TENS[Math.floor(count / 10)]; }
  const rest = count % 100;
  return rest ? `${ONES[Math.floor(count / 100)]} hundred ${couponCountWords(rest)}` : `${ONES[Math.floor(count / 100)]} hundred`;
}

/** Null keeps today's chip: flag off, not Korund, plan not loaded, or a count this line cannot say in words. */
export function korundWalletRations(nationId: string | undefined, coupons: KorundCouponView | null | undefined, now = Date.now(), enabled = korundWalletRationsEnabled()): KorundRationLine | null {
  if (!enabled || nationId !== 'korund' || !coupons) return null;
  const remaining = coupons.couponFoodRemaining;
  if (!Number.isInteger(remaining) || remaining < 0 || remaining > 999) return null;
  const expires = Date.parse(coupons.couponExpiresAt);
  if (!Number.isFinite(expires)) return null;
  const expired = expires <= now;
  const words = remaining === 1 ? 'one food coupon' : `${couponCountWords(remaining)} food coupons`;
  const text = expired ? 'expired' : remaining === 1 ? '1 food coupon' : `${remaining} food coupons`;
  return { remaining, words, expired, text };
}

const walletHelp = (code: string) => `Your ${code} wallet holds national money. Amounts update after completed transactions; loading means the citizen snapshot has not arrived.`;

export function korundWalletHelp(currencyCode: string, line: KorundRationLine | null): string {
  if (!line) return walletHelp(currencyCode);
  const state = line.expired ? `${line.words}, expired` : line.words;
  return `Your ${currencyCode} wallet holds national money. Remaining food coupons this week: ${state}. Amounts update after completed transactions; loading means the citizen snapshot has not arrived.`;
}

/** Replaces the chip's accessible name only while the ration line is showing. */
export function korundWalletName(walletMinor: number | undefined, currencyCode: string, line: KorundRationLine | null): string | undefined {
  if (!line) return undefined;
  const amount = walletMinor === undefined ? 'loading' : `${(walletMinor / 100).toFixed(2)} ${currencyCode === 'LN' ? 'Labor Notes' : currencyCode}`;
  const state = line.expired ? `${line.words}, expired` : line.words;
  return `Wallet, ${amount}. ${state.charAt(0).toUpperCase()}${state.slice(1)}.`;
}
