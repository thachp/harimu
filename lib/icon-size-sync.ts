/** #392 UI 56: Phosphor marks that follow text size use one source.
 *  NEXT_PUBLIC_HARIMU_ICON_SIZE_SYNC is HARIMU_UI_PACK entry 53
 *  ("true" in preview, "false" in production). A missing flag is off. Only the exact string "true" enables it.
 *  On, those marks pass size 1em and font-size carries the text scale. Off, they stay size 18. */
export const ICON_SIZE_SYNC_FLAG = 'NEXT_PUBLIC_HARIMU_ICON_SIZE_SYNC';

export function iconSizeSyncFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_ICON_SIZE_SYNC; }
  catch { return undefined; }
}
export function iconSizeSyncEnabled(value: string | undefined = iconSizeSyncFlag()): boolean {
  return value === 'true';
}
