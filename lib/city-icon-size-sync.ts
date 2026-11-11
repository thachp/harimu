/** #392 UI 61: City panel Phosphor marks follow text size.
 *  NEXT_PUBLIC_HARIMU_CITY_ICON_SIZE_SYNC is HARIMU_UI_PACK entry 58
 *  ("true" in preview, "false" in production). A missing flag is off. Only the exact string "true" enables it.
 *  On, City header stats, place marks and carets pass size 1em and font-size carries the text scale. Off, they stay size 16 and 18. */
export const CITY_ICON_SIZE_SYNC_FLAG = 'NEXT_PUBLIC_HARIMU_CITY_ICON_SIZE_SYNC';

export function cityIconSizeSyncFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_CITY_ICON_SIZE_SYNC; }
  catch { return undefined; }
}
export function cityIconSizeSyncEnabled(value: string | undefined = cityIconSizeSyncFlag()): boolean {
  return value === 'true';
}
