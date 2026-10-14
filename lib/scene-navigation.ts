export const viewModes = ['world', 'country', 'square', 'household', 'workplace', 'market', 'government', 'nation'] as const;
export type SceneView = typeof viewModes[number];
export const sceneHistoryKey = 'harimuScenePath';
/** Keep router scroll/snapshot metadata when adding a local game scene entry. */
export function sceneHistoryState(state: unknown, pathname: string): Record<string, unknown> {
  return { ...(state && typeof state === 'object' ? state : {}), [sceneHistoryKey]: pathname };
}
export function isSceneTraversal(state: unknown, pathname: string): boolean {
  return Boolean(state && typeof state === 'object' && sceneHistoryKey in state
    && (state as Record<string, unknown>)[sceneHistoryKey] === pathname);
}
export function sceneFromSearch(search: string): SceneView {
  const requested = new URLSearchParams(search).get('view');
  const view = requested === 'city' ? 'square' : requested === 'home' || requested === 'planning' ? 'household' : requested;
  return viewModes.includes(view as SceneView) ? view as SceneView : 'square';
}
export function nationFromSearch(search: string, validNationIds: readonly string[], fallbackId: string): string {
  const requested = new URLSearchParams(search).get('nation');
  return requested && validNationIds.includes(requested) ? requested : fallbackId;
}
export function sceneUrl(href: string, scene: SceneView, nationId?: string, cityId?: string): string {
  const url = new URL(href);
  url.searchParams.set('view', scene);
  if (scene === 'nation' || scene === 'world' || scene === 'country' || Boolean(cityId)) {
    if (nationId) url.searchParams.set('nation', nationId);
  } else url.searchParams.delete('nation');
  // A city belongs to one nation; never carry a previous nation's city forward (#55).
  if (cityId) url.searchParams.set('city', cityId); else url.searchParams.delete('city');
  return url.href;
}
/**
 * The game page owns every query-only history entry on its own pathname (#56).
 * The framework can rewrite an entry's state (e.g. the first entry during
 * hydration) and drop our marker, so a marker check alone would hand Back to
 * the RSC router, which remounts the page and reloads the citizen session.
 */
export function isGamePopstate(mountedPathname: string, currentPathname: string): boolean {
  return currentPathname === mountedPathname;
}
