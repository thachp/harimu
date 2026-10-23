/** Build-time flag NEXT_PUBLIC_HARIMU_NATION_SKIN (#85, docs 23.2 "The system is the skin"): a PoC nation skin on one chrome surface, the top bar.
 *  Kindle, Korund and Aurelle each get color tokens plus one CSS-only motif (app/game-shell.css, "#85" block); layout, copy and actions are unchanged.
 *  "true" in preview, "false" in production; only the exact string "true" enables it. Import-free so plain Node tests can load it. */
export const skinnedNations = ['kindle', 'korund', 'aurelle'] as const;
export type NationSkin = typeof skinnedNations[number];
export function nationSkinEnabled(value: string | undefined = process.env.NEXT_PUBLIC_HARIMU_NATION_SKIN): boolean { return value === 'true'; }
/** The skin for the signed-in citizen's nation; null (the neutral bar) for guests, pre-citizens, other nations or the flag off. */
export function nationSkin(citizenNationId: string | null | undefined, enabled: boolean = nationSkinEnabled()): NationSkin | null {
  return enabled && (skinnedNations as readonly string[]).includes(citizenNationId ?? '') ? citizenNationId as NationSkin : null;
}
