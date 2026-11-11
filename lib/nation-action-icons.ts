/** #392 UI 53: Nation overview action icons. NEXT_PUBLIC_HARIMU_NATION_ACTION_ICONS is HARIMU_UI_PACK entry 50
 *  ("true" in preview, "false" in production). A missing flag is off. Only the exact string "true" enables it.
 *  Explore {capital} leads with a bank mark and keeps its chevron. View institutions leads with a book.
 *  Both paint only when that button already renders, and only while the nation action row is on. */
export const NATION_ACTION_ICONS_FLAG = 'NEXT_PUBLIC_HARIMU_NATION_ACTION_ICONS';

export function nationActionIconsFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_NATION_ACTION_ICONS; }
  catch { return undefined; }
}
export function nationActionIconsEnabled(value: string | undefined = nationActionIconsFlag()): boolean {
  return value === 'true';
}
