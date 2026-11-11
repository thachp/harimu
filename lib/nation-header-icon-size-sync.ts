/** #392 UI 63: Nation header chip marks follow text size.
 *  NEXT_PUBLIC_HARIMU_NATION_HEADER_ICON_SIZE_SYNC is HARIMU_UI_PACK entry 60
 *  ("true" in preview, "false" in production). A missing flag is off. Only the exact string "true" enables it.
 *  On, and only while header chips are shown, those marks use size 1em and font-size carries the text scale. Off, they stay size 16. */
export const NATION_HEADER_ICON_SIZE_SYNC_FLAG = 'NEXT_PUBLIC_HARIMU_NATION_HEADER_ICON_SIZE_SYNC';

export function nationHeaderIconSizeSyncFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_NATION_HEADER_ICON_SIZE_SYNC; }
  catch { return undefined; }
}
export function nationHeaderIconSizeSyncEnabled(value: string | undefined = nationHeaderIconSizeSyncFlag()): boolean {
  return value === 'true';
}
