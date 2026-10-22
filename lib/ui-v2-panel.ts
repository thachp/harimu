/** Build-time flag NEXT_PUBLIC_HARIMU_UI_V2_PANEL (UI v2, stage S3 of #392): the World and City side panels open with the concept's panel shape
 *  (summary header, chevron rows, one primary action) built from existing content. "true" in preview, "false" in production; only the exact string "true" enables it. */
export function uiV2PanelEnabled(value: string | undefined = process.env.NEXT_PUBLIC_HARIMU_UI_V2_PANEL): boolean { return value === 'true'; }

/** #392 S3 follow-up: the concept's "Status: Capital" stat, derived from the existing city catalog (`capital` on lib/cities.ts entries; no new field).
 *  Returned only for a capital, so other cities show no Status stat. "Capital" is the country map's existing capital badge text. */
export function cityStatusStat(city: { capital?: boolean } | null | undefined): { label: string; value: string } | null { return city?.capital ? { label: 'Status', value: 'Capital' } : null; }
