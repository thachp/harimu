/** #392 UI 51: World atlas fact-row icons scale with text size. NEXT_PUBLIC_HARIMU_WORLD_ATLAS_ICON_SCALE is HARIMU_UI_PACK entry 48
 *  ("true" in preview, "false" in production). A missing flag is off. Only the exact string "true" enables it.
 *  The atlas adds the scale class only while the fact-icon flag is also on. */
export const WORLD_ATLAS_ICON_SCALE_FLAG = 'NEXT_PUBLIC_HARIMU_WORLD_ATLAS_ICON_SCALE';

export function worldAtlasIconScaleFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS_ICON_SCALE; }
  catch { return undefined; }
}
export function worldAtlasIconScaleEnabled(value: string | undefined = worldAtlasIconScaleFlag()): boolean {
  return value === 'true';
}
