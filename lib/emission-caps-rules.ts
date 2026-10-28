/** #885: Labor Note and Crown emission caps matching Spark's Charter Limit (docs §12.4).
 *  Pure rules (no imports), so tests load them directly.
 *  ARC on #885: Labor Note uses the monthly Charter Limit (15% of korund_resources.state.initial_minor, summed over
 *  labor_note_issuances in the game month). Crown uses the yearly Charter Limit (30% of aurelle_resources.estate.initial_minor,
 *  summed over crown_issuances amounts plus each crown_decrees.percent_bp converted against estate initial_minor in the game year).
 *  Each currency keeps its own cap period (not a docs bug). The bp figures are the same named constants as lib/spark-supply-rules
 *  (charterMonthBp 1500, charterYearBp 3000); the Crown year length matches lib/crown-debasement-rules gameYearSeconds.
 *  Flag HARIMU_EMISSION_CAPS_ENABLED: preview true, production false. Off: settle and decree paths stay byte-identical. No migration. */
export const emissionCapsEnabled = (env: { HARIMU_EMISSION_CAPS_ENABLED?: string } | null | undefined) =>
  env?.HARIMU_EMISSION_CAPS_ENABLED === 'true';

export const emissionCapsConfig = {
  /** Labor Note monthly: Spark charterMonthBp (docs 12.4 Charter Limit 15%). */
  laborNoteMonthBp: 1500,
  /** Crown yearly: Spark charterYearBp (docs 12.4 Charter Limit 30%). ARC: Crown uses the year, not the month. */
  crownYearBp: 3000,
  /** Same PLACEHOLDER as sparkConfig.gameMonthSeconds (30 game days at 12x). */
  gameMonthSeconds: 216000,
  /** Same as crownConfig.gameYearSeconds (and Spark's 12 game months). */
  gameYearSeconds: 30 * 86400,
} as const;

/** Whole minor units, floored — same rule as spark-supply-rules.issuanceAmount. */
export const emissionAmount = (supplyMinor: number, basisPoints: number): number =>
  Math.floor(supplyMinor * basisPoints / 10000);
export const charterMonthCap = (monthStartSupply: number): number =>
  emissionAmount(monthStartSupply, emissionCapsConfig.laborNoteMonthBp);
export const charterYearCap = (yearStartSupply: number): number =>
  emissionAmount(yearStartSupply, emissionCapsConfig.crownYearBp);

/** Inclusive start / exclusive end of the Spark game month containing `now`. */
export function laborNoteMonthWindow(now: number, epochSeconds: number) {
  const elapsed = Math.max(0, now - epochSeconds);
  const month = Math.floor(elapsed / emissionCapsConfig.gameMonthSeconds) + 1;
  const start = epochSeconds + (month - 1) * emissionCapsConfig.gameMonthSeconds;
  return { month, start, end: start + emissionCapsConfig.gameMonthSeconds };
}

/** Inclusive start / exclusive end of the Crown game year containing `now` (same clock as crown_decrees.game_year). */
export function crownYearWindow(now: number, epochSeconds: number) {
  const elapsed = Math.max(0, now - epochSeconds);
  const year = Math.floor(elapsed / emissionCapsConfig.gameYearSeconds) + 1;
  const start = epochSeconds + (year - 1) * emissionCapsConfig.gameYearSeconds;
  return { year, start, end: start + emissionCapsConfig.gameYearSeconds };
}

/** Debasement's contribution toward the Crown yearly emission total: percent_bp of estate initial_minor, floored. */
export const debasementEmissionAmount = (estateInitialMinor: number, percentBp: number) =>
  emissionAmount(estateInitialMinor, percentBp);
