// Kindle income tax (issue #86). Integer minor units: 100 = 1 SPK.
// PoC: the rate is config, not an AI Assembly vote. It is shown as set by the AI Assembly.
export const kindleIncomeTaxBand = { min: 0, max: 50 } as const;
/** [ASSUMPTION] default Kindle income tax rate, in whole percent. */
export const kindleIncomeTaxConfigPercent = 15;
export const kindleTreasuryFundId = 'kindle-treasury';
export const incomeTaxRateSource = 'set by the AI Assembly';

/** Clamp a configured rate into the 0–50% band. Non-numbers fall back to the default. */
export function clampIncomeTaxPercent(raw: unknown, fallback = kindleIncomeTaxConfigPercent): number {
  const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(kindleIncomeTaxBand.max, Math.max(kindleIncomeTaxBand.min, Math.floor(value)));
}

export const kindleIncomeTaxPercent = clampIncomeTaxPercent(kindleIncomeTaxConfigPercent);

/** Withholding rounds down, in the citizen's favor. */
export function withholdIncomeTax(grossMinor: number, percent = kindleIncomeTaxPercent) {
  const gross = Math.max(0, Math.floor(grossMinor));
  const taxMinor = Math.floor((gross * clampIncomeTaxPercent(percent)) / 100);
  return { grossMinor: gross, taxMinor, netMinor: gross - taxMinor, percent: clampIncomeTaxPercent(percent) };
}

/** Feature flag HARIMU_KINDLE_INCOME_TAX_ENABLED (ships "false"). Off: nothing is withheld and no tax lines are shown. */
export function activeIncomeTaxPercent(flag: unknown): number {
  return flag === 'true' ? kindleIncomeTaxPercent : 0;
}

/** Shift board / wallet copy: gross, tax and net side by side, from the same rounding as settlement.
 *  With the tax off (percent 0) it is just the wage. */
export function describeKindlePay(grossMinor: number, percent: number): string {
  const spk = (minor: number) => (minor / 100).toFixed(2);
  if (!(percent > 0)) return `${spk(Math.max(0, Math.floor(grossMinor)))} SPK`;
  const pay = withholdIncomeTax(grossMinor, percent);
  return `${spk(pay.grossMinor)} SPK gross − ${spk(pay.taxMinor)} income tax (${pay.percent}%, ${incomeTaxRateSource}) = ${spk(pay.netMinor)} SPK net`;
}
