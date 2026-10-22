/** Build-time flag NEXT_PUBLIC_HARIMU_UI_V2_RAIL (UI v2, stage S4 of #392): the zoom levels World / Nation / City move to a left rail and the top tabs keep
 *  only the places (Household, Work, Market, Civic), per Patrick's #392 decision 1. "true" in preview, "false" in production; only the exact string "true" enables it. */
export function uiV2RailEnabled(value: string | undefined = process.env.NEXT_PUBLIC_HARIMU_UI_V2_RAIL): boolean { return value === 'true'; }
/** The rail's levels, in zoom order. Labels are Patrick's #392 wording (decision 1): World / Nation / City. */
export const railLevels = [{ id: 'world', name: 'World' }, { id: 'country', name: 'Nation' }, { id: 'square', name: 'City' }] as const;
export type RailLevelId = typeof railLevels[number]['id'];
/** The level the current view sits in: World; Nation for the country map and the nation institutions; City for the square and every place inside it. */
export function railLevelOf(view: string): RailLevelId { return view === 'world' ? 'world' : view === 'country' || view === 'nation' ? 'country' : 'square'; }
/** aria-current for a rail level: "page" when the view is that level itself, "location" when the view is a place inside it (e.g. Household inside City). */
export function railCurrent(level: RailLevelId, view: string): 'page' | 'location' | undefined { return railLevelOf(view) !== level ? undefined : view === level ? 'page' : 'location'; }
/** Arrow keys, Home and End move focus between the rail's buttons (Tab still enters and leaves the rail). Returns the index to focus, or null. */
export function railKeyTarget(key: string, index: number, count: number): number | null {
  if (key === 'ArrowDown' || key === 'ArrowRight') return (index + 1) % count;
  if (key === 'ArrowUp' || key === 'ArrowLeft') return (index - 1 + count) % count;
  if (key === 'Home') return 0; if (key === 'End') return count - 1; return null;
}
