/** #392 UI 67: Household fact-row icons. NEXT_PUBLIC_HARIMU_HOUSEHOLD_FACT_ICONS is HARIMU_UI_PACK entry 64
 *  ("true" in preview, "false" in production). A missing flag is off. Only the exact string "true" enables it.
 *  Wallet, Food, Residence and Pantry use marks already in the game chrome. Any other label has no icon. */
export const HOUSEHOLD_FACT_ICONS_FLAG = 'NEXT_PUBLIC_HARIMU_HOUSEHOLD_FACT_ICONS';
export function householdFactIconsFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_HOUSEHOLD_FACT_ICONS; }
  catch { return undefined; }
}
export function householdFactIconsEnabled(value: string | undefined = householdFactIconsFlag()): boolean {
  return value === 'true';
}
/** Phosphor names. Wallet and Food match the top-bar chips, Residence the household rail, Pantry the materials chip. */
export const HOUSEHOLD_FACT_ICONS = {
  Wallet: 'Coins',
  Food: 'Bread',
  Residence: 'House',
  Pantry: 'Cube',
} as const;
export type HouseholdFactIconName = (typeof HOUSEHOLD_FACT_ICONS)[keyof typeof HOUSEHOLD_FACT_ICONS];
export function householdFactIcon(label: string): HouseholdFactIconName | null {
  if (!Object.prototype.hasOwnProperty.call(HOUSEHOLD_FACT_ICONS, label)) return null;
  return HOUSEHOLD_FACT_ICONS[label as keyof typeof HOUSEHOLD_FACT_ICONS];
}
