/** #432: daily ledger reconciliation PoC, pure rules (no runtime imports, so tests load them directly).
 *  Canon: harimu-docs 12.10 (Duplication, rounding: one double-entry ledger, integer minor units, atomic conversions, daily reconciliation) and 12.8 (home
 *  account, integer minor units only). The docs give no numbers for this job. Every figure below is a PLACEHOLDER. */
export const reconciliationCurrencies = ['SPK', 'LN', 'CRN', 'TSR'] as const;
export type ReconciliationCurrency = typeof reconciliationCurrencies[number];
export const reconciliationConfig = {
  gameDaySeconds: 7200,     // PLACEHOLDER: one game day is 7200 real seconds (12x time), the unit every other Worker job here uses; docs 12.7 say "about every 2 real hours"
  firstMismatchLimit: 10,   // PLACEHOLDER: each report keeps the first 10 mismatching ids (the issue says "the first few")
  minAdminTokenLength: 16,  // PLACEHOLDER: shorter HARIMU_ADMIN_TOKEN values never authorize (same floor as the war admin helper in #429)
} as const;

/** Game day number (1-based) from the world clock epoch. */
export const reconciliationGameDay = (now: number, epochSeconds: number): number => Math.floor(Math.max(0, now - epochSeconds) / reconciliationConfig.gameDaySeconds) + 1;
/** Integer minor units only (docs 12.8, 12.10). */
export const isMinorUnit = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);

export type Mismatch = { currency: ReconciliationCurrency; check: string; account: string };
/** The report keeps only the first few mismatches, in the order the checks ran; the count stays exact. */
export const firstMismatches = (found: readonly Mismatch[]): Mismatch[] => found.slice(0, reconciliationConfig.firstMismatchLimit);

export type CurrencyTotals = { entries: number; creditsMinor: number; debitsMinor: number; walletTotalMinor: number; accounts: number; mismatches: number };
