/** Build-time flag NEXT_PUBLIC_HARIMU_UI_V2_CITY (UI v2, stage S7 of #392): City hotspots become icon pills with a leader dot over the existing 3D scene,
 *  and the bottom "City destinations" strip goes, because the panel's destination rows (S3, NEXT_PUBLIC_HARIMU_UI_V2_PANEL) carry the same destinations.
 *  "true" in preview, "false" in production; only the exact string "true" enables it. Import-free so plain Node tests can load it. */
export function uiV2CityEnabled(value: string | undefined = process.env.NEXT_PUBLIC_HARIMU_UI_V2_CITY): boolean { return value === 'true'; }
/** The strip is removed only on the City view and only while the panel rows exist (S3 on), so every destination stays reachable from the panel. */
export function cityStripHidden(view: string, city: boolean = uiV2CityEnabled(), panel: boolean = process.env.NEXT_PUBLIC_HARIMU_UI_V2_PANEL === 'true'): boolean { return city && panel && view === 'square'; }
