/** Build-time flag NEXT_PUBLIC_HARIMU_UI_V2_PANEL (UI v2, stage S3 of #392): the World and City side panels open with the concept's panel shape
 *  (summary header, chevron rows, one primary action) built from existing content. "true" in preview, "false" in production; only the exact string "true" enables it. */
export function uiV2PanelEnabled(value: string | undefined = process.env.NEXT_PUBLIC_HARIMU_UI_V2_PANEL): boolean { return value === 'true'; }
