/** Build-time flag NEXT_PUBLIC_HARIMU_UI_V2_WORLD (UI v2, stage S5 of #392): the World nation strip becomes a row of crest chips (S1 crest + name + the existing
 *  badges), as in the concept's World screen. "true" in preview, "false" in production; only the exact string "true" enables it. */
export function uiV2WorldEnabled(value: string | undefined = process.env.NEXT_PUBLIC_HARIMU_UI_V2_WORLD): boolean { return value === 'true'; }

/** #392 UI 39: crest-only World nation strip. HARIMU_UI_PACK entry 37.
 *  Preview "true", production "false". A missing flag is off. Only the exact string "true" enables it.
 *  Layout bundles that omit the define have no `process`. */
export const WORLD_CREST_STRIP_FLAG = 'NEXT_PUBLIC_HARIMU_WORLD_CREST_STRIP';
export function worldCrestStripFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_WORLD_CREST_STRIP; }
  catch { return undefined; }
}
export function worldCrestStripEnabled(value: string | undefined = worldCrestStripFlag()): boolean {
  return value === 'true';
}
