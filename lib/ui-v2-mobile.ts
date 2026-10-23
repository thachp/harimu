/** Build-time flag NEXT_PUBLIC_HARIMU_UI_V2_MOBILE (UI v2, stage S8 of #392, "Mobile pass"): on a phone (760px and below) the S4 rail and the place tabs
 *  become a bottom tab bar (above the citizen dock when there is one) and the panel reads as a bottom sheet under the scene. Desktop is unchanged.
 *  Needs the S4 rail (it moves the rail's own row). CSS only (app/game-shell.css "#392 S8"); copy, order of controls and actions are unchanged.
 *  "true" in preview, "false" in production; only the exact string "true" enables it. Import-free so plain Node tests can load it. */
export function uiV2MobileEnabled(value: string | undefined = process.env.NEXT_PUBLIC_HARIMU_UI_V2_MOBILE, rail: boolean = process.env.NEXT_PUBLIC_HARIMU_UI_V2_RAIL === 'true'): boolean { return value === 'true' && rail; }
