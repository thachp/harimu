/** #362: Aurelle Crown debasement PoC, pure rules (no runtime imports beyond the seeded roll, so tests load them directly).
 *  Canon: harimu-docs 12.3 (Aurelle Crown is a gold-backed coin; debasement, more Crowns per bar, gives the crown a windfall but drops
 *  Currency Confidence; full-weight old coins are then hoarded and trade at a premium) and 12.4 (the Monarch may debase by decree up to
 *  15% per game year). Only the 15% cap and the once-per-game-year limit come from the docs; every other number is a config [ASSUMPTION]. */
export const crownConfig = {
  debasementCapBp: 1500,            // docs 12.4: debasement by decree, up to 15% per game year (basis points of mint parity)
  baselineParity: 1000,             // Crowns struck per gold bar before any debasement [ASSUMPTION] (label only, parity is relative)
  baselineConfidence: 100,          // Currency Confidence is 0-100 (docs 12.4); it starts full
  confidenceDrop: 10,               // fixed Confidence points lost per debasement [ASSUMPTION]
  gameYearSeconds: 30 * 86400,      // docs 12.4: 30% a game year is about 2.2x in three game years, about three real months [ASSUMPTION]
  baselineTessera: 500,             // PoC placeholder official quote at baseline parity, in thousandths: 1 CRN = 0.500 TSR [ASSUMPTION]
  yearlyDecreeChancePct: 25,        // the AI Monarch's seeded chance of debasing in a given game year [ASSUMPTION]
  rumorWindowSeconds: 6 * 3600,     // the full-weight premium rumor is re-rolled every six real hours [ASSUMPTION]
  rumorLowPct: 50, rumorHighPct: 150, // the rumor reports 50-150% of the real debasement
} as const;

/** FNV-1a seeded roll, the same as lib/aurelle-coup-rules (copied so this file has no runtime imports and tests can load it directly). */
const roll = (seed: string, modulo: number): number => {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return (h >>> 0) % modulo;
};

export const crownDecreeIdOk = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(value);

/** Game year number (1-based) from the world clock epoch. */
export function gameYear(now: number, epochSeconds: number): number {
  return Math.floor(Math.max(0, now - epochSeconds) / crownConfig.gameYearSeconds) + 1;
}
/** More Crowns per gold bar: parity grows by `percentBp` basis points. Rounds to whole Crowns. */
export function debasedParity(parity: number, percentBp: number): number {
  return Math.round(parity * (10000 + percentBp) / 10000);
}
export const debasementBpOk = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= crownConfig.debasementCapBp;
export const confidenceAfter = (before: number): number => Math.max(0, before - crownConfig.confidenceDrop);
/** Official Crown quote in thousandths of a Tessera per Crown. More Crowns per bar means each Crown holds less gold. */
export function officialTesseraMilli(parity: number): number {
  return Math.floor(crownConfig.baselineTessera * crownConfig.baselineParity / Math.max(1, parity));
}
/** #999: Crown minor units (100 = 1.00 CRN) quoted in Tessera minor units (100 = 1.00 TSR) at the official rate.
 *  `tesseraMilliPerCrown` is officialTesseraMilli — the same thousandths the Royal Mint strip shows. Rounded down, so a quote never overstates value. */
export function quoteCrownTessera(crownMinor: number, tesseraMilliPerCrown: number): number {
  if (!Number.isSafeInteger(crownMinor) || crownMinor <= 0 || !Number.isSafeInteger(tesseraMilliPerCrown) || tesseraMilliPerCrown <= 0) return 0;
  return Math.floor(crownMinor * tesseraMilliPerCrown / 1000);
}
/** Cumulative debasement against the baseline parity, in basis points (0 when never debased). */
export const debasedBp = (parity: number): number => Math.max(0, Math.floor((parity - crownConfig.baselineParity) * 10000 / crownConfig.baselineParity));
/** The noisy "full-weight old coins trade at a premium" rumor (docs 12.3 and 12.9), derived on read, never an order book:
 *  between rumorLowPct and rumorHighPct of the real debasement, re-rolled each window. Null until the Crown has been debased. */
export function rumoredPremiumBp(parity: number, now: number): number | null {
  const base = debasedBp(parity);
  if (base <= 0) return null;
  const bucket = Math.floor(now / crownConfig.rumorWindowSeconds);
  const span = crownConfig.rumorHighPct - crownConfig.rumorLowPct + 1;
  return Math.floor(base * (crownConfig.rumorLowPct + roll(`crown-rumor:${bucket}:${parity}`, span)) / 100);
}

/** The AI Monarch's decision for a game year: whether this year it debases, when it does (a seeded day inside the year) and by how much.
 *  Fixed rules, no live AI model; the same year always gives the same answer. */
export function monarchPlan(year: number): { debases: boolean; offsetSeconds: number; percentBp: number } {
  const days = crownConfig.gameYearSeconds / 86400;
  return {
    debases: roll(`crown-year:${year}`, 100) < crownConfig.yearlyDecreeChancePct,
    offsetSeconds: roll(`crown-day:${year}`, days) * 86400,
    percentBp: (1 + roll(`crown-size:${year}`, crownConfig.debasementCapBp / 100)) * 100,
  };
}
