/** #392 UI 47: City Open household CTA. NEXT_PUBLIC_HARIMU_CITY_OPEN_HOUSEHOLD is HARIMU_UI_PACK entry 44
 *  ("true" in preview, "false" in production). A missing flag is off. Only the exact string "true" enables it.
 *  The household primary reads "Open household" only when that card's label is exactly "Household". */
export const CITY_OPEN_HOUSEHOLD_FLAG = 'NEXT_PUBLIC_HARIMU_CITY_OPEN_HOUSEHOLD';
export const CITY_OPEN_HOUSEHOLD_LABEL = 'Open household';

export function cityOpenHouseholdFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_CITY_OPEN_HOUSEHOLD; }
  catch { return undefined; }
}
export function cityOpenHouseholdEnabled(value: string | undefined = cityOpenHouseholdFlag()): boolean {
  return value === 'true';
}

/** Visible label for the household primary. Any other card label is returned unchanged. */
export function cityOpenHouseholdLabel(cardLabel: string, enabled: boolean): string {
  return enabled && cardLabel === 'Household' ? CITY_OPEN_HOUSEHOLD_LABEL : cardLabel;
}
