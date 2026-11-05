/** #1158 (#392 S4): restyle the world clock chip and the World / Nation / City / Household zoom controls.
 *  NEXT_PUBLIC_HARIMU_CLOCK_ZOOM is a HARIMU_UI_PACK key ("true" in preview, "false" in production).
 *  Layout bundles that omit the define have no `process`. A missing flag is off. Only the exact string "true" enables it. */
export const clockZoomLevelIds = ['world', 'country', 'square', 'household'] as const;

export function clockZoomFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_CLOCK_ZOOM; }
  catch { return undefined; }
}
export function clockZoomEnabled(value: string | undefined = clockZoomFlag()): boolean {
  return value === 'true';
}
/** World, Nation (the country view), City and Household. Work, Market and Civic stay as they are. */
export function isClockZoomLevel(id: string): boolean {
  return (clockZoomLevelIds as readonly string[]).includes(id);
}
