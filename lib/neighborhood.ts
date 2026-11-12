/** #1315 N1. NEXT_PUBLIC_HARIMU_NEIGHBORHOOD is HARIMU_UI_PACK entry 67
 *  ("true" in preview, "false" in production). A missing flag is off. Only the exact string "true" enables it. */
export const NEIGHBORHOOD_FLAG = 'NEXT_PUBLIC_HARIMU_NEIGHBORHOOD';
export function neighborhoodFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_NEIGHBORHOOD; }
  catch { return undefined; }
}
export function neighborhoodEnabled(value: string | undefined = neighborhoodFlag()): boolean {
  return value === 'true';
}
