/** #392 UI 68: Household fact values align to the trailing edge. NEXT_PUBLIC_HARIMU_HOUSEHOLD_FACT_VALUE_ALIGN is HARIMU_UI_PACK entry 65
 *  ("true" in preview, "false" in production). A missing flag is off. Only the exact string "true" enables it.
 *  The alignment applies to household fact rows (UI 67). Wrapping stats stay as they are. */
export const HOUSEHOLD_FACT_VALUE_ALIGN_FLAG = 'NEXT_PUBLIC_HARIMU_HOUSEHOLD_FACT_VALUE_ALIGN';
export function householdFactValueAlignFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_HOUSEHOLD_FACT_VALUE_ALIGN; }
  catch { return undefined; }
}
export function householdFactValueAlignEnabled(value: string | undefined = householdFactValueAlignFlag()): boolean {
  return value === 'true';
}
