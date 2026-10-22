/** Build-time flag NEXT_PUBLIC_HARIMU_UI_V2_WORLD (UI v2, stage S5 of #392): the World nation strip becomes a row of crest chips (S1 crest + name + the existing
 *  badges), as in the concept's World screen. "true" in preview, "false" in production; only the exact string "true" enables it. */
export function uiV2WorldEnabled(value: string | undefined = process.env.NEXT_PUBLIC_HARIMU_UI_V2_WORLD): boolean { return value === 'true'; }
