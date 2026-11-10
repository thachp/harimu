/** #392 UI 48: City tagline beside the title. NEXT_PUBLIC_HARIMU_CITY_TAGLINE_BESIDE is HARIMU_UI_PACK entry 45
 *  ("true" in preview, "false" in production). A missing flag is off. Only the exact string "true" enables it.
 *  Flag on places the city's description to the right of the title. Blank stays hidden. Flag off keeps today's head. */
export const CITY_TAGLINE_BESIDE_FLAG = 'NEXT_PUBLIC_HARIMU_CITY_TAGLINE_BESIDE';

export function cityTaglineBesideFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_CITY_TAGLINE_BESIDE; }
  catch { return undefined; }
}
export function cityTaglineBesideEnabled(value: string | undefined = cityTaglineBesideFlag()): boolean {
  return value === 'true';
}
