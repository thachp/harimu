/** #392 UI 49: consistent accessible name for the City household primary.
 *  NEXT_PUBLIC_HARIMU_CITY_HOUSEHOLD_ACCESSIBLE_NAME is HARIMU_UI_PACK entry 46
 *  ("true" in preview, "false" in production). A missing flag is off. Only the exact string "true" enables it.
 *  Flag on: the primary's accessible name is "{visible label}: {detail}" whenever the detail is non-blank.
 *  A blank detail sets no aria-label. Flag off returns today's name unchanged. */
export const CITY_HOUSEHOLD_ACCESSIBLE_NAME_FLAG = 'NEXT_PUBLIC_HARIMU_CITY_HOUSEHOLD_ACCESSIBLE_NAME';

export function cityHouseholdAccessibleNameFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_CITY_HOUSEHOLD_ACCESSIBLE_NAME; }
  catch { return undefined; }
}
export function cityHouseholdAccessibleNameEnabled(value: string | undefined = cityHouseholdAccessibleNameFlag()): boolean {
  return value === 'true';
}

/** Accessible name for the household primary. The visible label is the start of the name. Flag off returns `legacy`. */
export function cityHouseholdAriaLabel(label: string, detail: string, enabled: boolean, legacy: string | undefined): string | undefined {
  if (!enabled) return legacy;
  const text = detail.trim();
  return text ? `${label}: ${text}` : undefined;
}
