/** #1050: Aurelle top-bar coins show the Royal Mint official rate (docs §23.2).
 *  NEXT_PUBLIC_HARIMU_AURELLE_WALLET_PARITY is a HARIMU_UI_PACK key ("true" in preview, "false" in production).
 *  Layout bundles that omit the define have no `process`. A missing flag is off. */
const DIGITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'] as const;

/** The mint object already on the Aurelle plan. No new fields. */
export type AurelleMintView = {
  officialRate?: { tesseraMilliPerCrown?: number | null } | null;
  lastDecree?: { parityBefore?: number | null; parityAfter?: number | null } | null;
};

export function aurelleWalletParityFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_AURELLE_WALLET_PARITY; }
  catch { return undefined; }
}
export function aurelleWalletParityEnabled(value: string | undefined = aurelleWalletParityFlag()): boolean {
  return value === 'true';
}

/** Same thousandths the Royal Mint strip prints: (tesseraMilliPerCrown / 1000).toFixed(3). Null when that figure is missing. */
export function aurelleMintRate(mint: AurelleMintView | null | undefined): string | null {
  const milli = mint?.officialRate?.tesseraMilliPerCrown;
  if (typeof milli !== 'number' || !Number.isInteger(milli) || milli <= 0) return null;
  return (milli / 1000).toFixed(3);
}

/** Accessible wording for a strip rate such as "0.500" → "zero point five zero zero". */
export function parityRateWords(rate: string): string {
  const [whole, frac = ''] = rate.split('.');
  const head = DIGITS[Number(whole)] ?? whole;
  const tail = [...frac].map(ch => DIGITS[Number(ch)] ?? ch).join(' ');
  return frac ? `${head} point ${tail}` : head;
}

/** A marker only when a recorded decree already says the parity moved. */
export function aurelleMintMoved(mint: AurelleMintView | null | undefined): boolean {
  const before = mint?.lastDecree?.parityBefore, after = mint?.lastDecree?.parityAfter;
  return typeof before === 'number' && typeof after === 'number' && Number.isInteger(before) && Number.isInteger(after) && after !== before;
}

export function aurelleWalletParity(nationId: string | undefined, currencyCode: string, mint: AurelleMintView | null | undefined, enabled = aurelleWalletParityEnabled()): { rate: string; words: string; moved: boolean } | null {
  if (!enabled || nationId !== 'aurelle' || currencyCode !== 'CRN') return null;
  const rate = aurelleMintRate(mint);
  if (!rate) return null;
  return { rate, words: parityRateWords(rate), moved: aurelleMintMoved(mint) };
}
