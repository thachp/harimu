/** Build-time flag NEXT_PUBLIC_HARIMU_UI_V2_HOUSEHOLD (UI v2, stage S9 of #392): the Household panel in the concept's shape, existing data only.
 *  Rows: Wallet, Food, Residence and a Pantry row derived from food and materials; family cards with the four existing Vale portraits (public/assets/household).
 *  Needs and mood show only where the data exists (none today). No furnishings, honors or "Arrange your home". Needs the S3 panel.
 *  "true" in preview, "false" in production; only the exact string "true" enables it. Import-free so plain Node tests can load it. */
export function uiV2HouseholdEnabled(value: string | undefined = process.env.NEXT_PUBLIC_HARIMU_UI_V2_HOUSEHOLD, panel: boolean = process.env.NEXT_PUBLIC_HARIMU_UI_V2_PANEL === 'true'): boolean { return value === 'true' && panel; }
/** Units of an item in the citizen's inventory (0 when absent). */
export function itemCount(inventory: readonly { item: string; quantity: number }[] | null | undefined, item: string): number { return inventory?.find(entry => entry.item === item)?.quantity ?? 0; }
