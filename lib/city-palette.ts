/** #392: per-nation city ground and lights on the current 3D capital.
 *  NEXT_PUBLIC_HARIMU_CITY_PALETTE is HARIMU_UI_PACK entry 35 ("true" in preview, "false" in production).
 *  Layout bundles that omit the define have no `process`. A missing flag is off. Only the exact string "true" enables it.
 *  Flag off returns the shared cream lights. Flag on is a plain swap of that capital's tokens: no light transition. */
import { capitalProfiles, citySceneGlobals } from './game-art.ts';

export const CITY_PALETTE_FLAG = 'NEXT_PUBLIC_HARIMU_CITY_PALETTE';

export function cityPaletteFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_CITY_PALETTE; }
  catch { return undefined; }
}
export function cityPaletteEnabled(value: string | undefined = cityPaletteFlag()): boolean {
  return value === 'true';
}

export type CityLight = { hemisphere: number; sky: string; ground: string; sunColor: string; sunIntensity: number };

/** Hemisphere intensity stays at 2.2 so building silhouettes keep the same fill. Sun gain scales the caller's sun. */
export function cityLight(enabled: boolean, nationId: string, sun = 3.2): CityLight {
  const shared = { hemisphere: citySceneGlobals.hemisphere, sky: citySceneGlobals.sky, ground: citySceneGlobals.hemisphereGround, sunColor: citySceneGlobals.sun, sunIntensity: sun };
  if (!enabled) return shared;
  const scene = (capitalProfiles[nationId.toLowerCase()] ?? capitalProfiles.kindle).scene;
  return { hemisphere: shared.hemisphere, sky: scene.sky, ground: scene.hemisphereGround, sunColor: scene.sun, sunIntensity: sun * scene.sunIntensity };
}
