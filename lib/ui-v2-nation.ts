/** Build-time flag NEXT_PUBLIC_HARIMU_UI_V2_NATION (UI v2, stage S6 of #392): the Nation panel opens with the S3 panel shape — the nation's name and motto,
 *  key facts, its institution systems as chevron rows, and the "Explore {nation}" action to the nation map. "true" in preview, "false" in production. */
export function uiV2NationEnabled(value: string | undefined = process.env.NEXT_PUBLIC_HARIMU_UI_V2_NATION): boolean { return value === 'true'; }
/** Content's copy for the primary action (#392 S6): one pattern for all ten nations, using the short display name. The accessible label starts with the visible text. */
export function exploreNationLabels(shortName: string): { label: string; ariaLabel: string } { return { label: `Explore ${shortName}`, ariaLabel: `Explore ${shortName}: open the nation map` }; }
