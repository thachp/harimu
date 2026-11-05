/** #1174: soften the blown-out highlight on the world globe (?view=world).
 *  NEXT_PUBLIC_HARIMU_GLOBE_RIM is a HARIMU_UI_PACK key ("true" in preview, "false" in production).
 *  Layout bundles that omit the define have no `process`. A missing flag is off. Only the exact string "true" enables it.
 *
 *  The cream blob is not a bloom sprite and not the atmosphere shell (a 9% blue back-face).
 *  The renderer leaves tone mapping off (Three.js NoToneMapping), so light above 1 clips to white.
 *  Two cream lights sit on the upper hemisphere: the hemisphere sky `#fff3d6` at intensity 2.2,
 *  and the directional sun `#ffe2ac` at intensity 3.2, placed above the globe (y = 24).
 *  MeshStandardMaterial roughness 0.84 still has a wide specular lobe, so that sun clips to a white/cream patch
 *  and the nations under it disappear. Flag on turns the sun into a dim grazing rim and keeps an even neutral fill. */
export const GLOBE_RIM_FLAG = 'NEXT_PUBLIC_HARIMU_GLOBE_RIM';

export function globeRimFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_GLOBE_RIM; }
  catch { return undefined; }
}
export function globeRimEnabled(value: string | undefined = globeRimFlag()): boolean {
  return value === 'true';
}

export type GlobeLight = {
  hemisphere: number;
  sky: string;
  ground: string;
  sunColor: string;
  /** Flag off returns the caller's intensity unchanged (desktop 3.2, phone top-down 1.5). */
  sunIntensity: number;
  sunPosition: readonly [number, number, number];
  roughness: number;
};

/** Historical world/city sun: above and in front, which is what clips the upper face. */
const FACING_SUN: readonly [number, number, number] = [-15, 24, 12];
/** Above the limb and just behind the camera-facing +Z side, so the upper edge lights and the nations in front do not. */
const RIM_SUN: readonly [number, number, number] = [8, 22, -4];

export function globeLight(enabled: boolean, sun = 3.2): GlobeLight {
  if (!enabled) return { hemisphere: 2.2, sky: '#fff3d6', ground: '#334b4d', sunColor: '#ffe2ac', sunIntensity: sun, sunPosition: FACING_SUN, roughness: 0.84 };
  return { hemisphere: 1.85, sky: '#d5e2e8', ground: '#3c5458', sunColor: '#f0ddb8', sunIntensity: 0.55, sunPosition: RIM_SUN, roughness: 1 };
}
