/** #392 UI 52: World atlas Explore action icons. NEXT_PUBLIC_HARIMU_WORLD_ATLAS_EXPLORE_ICONS is HARIMU_UI_PACK entry 49
 *  ("true" in preview, "false" in production). A missing flag is off. Only the exact string "true" enables it.
 *  The atlas adds a compass on the explore kicker and a bank mark plus chevron on the Explore button.
 *  Both paint only when that control already renders. The Nation overview button is not part of this flag. */
export const WORLD_ATLAS_EXPLORE_ICONS_FLAG = 'NEXT_PUBLIC_HARIMU_WORLD_ATLAS_EXPLORE_ICONS';

export function worldAtlasExploreIconsFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS_EXPLORE_ICONS; }
  catch { return undefined; }
}
export function worldAtlasExploreIconsEnabled(value: string | undefined = worldAtlasExploreIconsFlag()): boolean {
  return value === 'true';
}
