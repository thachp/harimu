/** #392 UI 46: World atlas identity. NEXT_PUBLIC_HARIMU_WORLD_ATLAS_IDENTITY is HARIMU_UI_PACK entry 43
 *  ("true" in preview, "false" in production). A missing flag is off. Only the exact string "true" enables it.
 *  The tagline counts the nation list already passed into the atlas. Ten is the word for a length of 10.
 *  Any other positive length uses that number. An empty list hides the line. */
export const WORLD_ATLAS_IDENTITY_FLAG = 'NEXT_PUBLIC_HARIMU_WORLD_ATLAS_IDENTITY';
export const WORLD_ATLAS_IDENTITY_TITLE = 'Harimu';
export const WORLD_ATLAS_IDENTITY_KICKER = 'World atlas';
export const WORLD_ATLAS_EXPLORE_KICKER = 'Explore the world';

export function worldAtlasIdentityFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS_IDENTITY; }
  catch { return undefined; }
}
export function worldAtlasIdentityEnabled(value: string | undefined = worldAtlasIdentityFlag()): boolean {
  return value === 'true';
}

/** "One world. Ten nations." when the list has 10 entries. One uses "nation"; every other positive count uses "nations". */
export function worldAtlasIdentityTagline(nations: readonly unknown[] | null | undefined): string | null {
  const count = Array.isArray(nations) ? nations.length : 0;
  if (count < 1) return null;
  const shown = count === 10 ? 'Ten' : String(count);
  return `One world. ${shown} ${count === 1 ? 'nation' : 'nations'}.`;
}

/** The kicker sits above the existing Explore button. No button, no kicker. */
export function worldAtlasExploreKicker(shown: boolean): string | null {
  return shown ? WORLD_ATLAS_EXPLORE_KICKER : null;
}
