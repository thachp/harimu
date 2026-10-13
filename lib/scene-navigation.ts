export const viewModes = ['world', 'square', 'household', 'workplace', 'market', 'government', 'nation'] as const;
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
  const view = requested === 'home' || requested === 'planning' ? 'household' : requested;
  return viewModes.includes(view as SceneView) ? view as SceneView : 'square';
}
export function nationFromSearch(search: string, validNationIds: readonly string[], fallbackId: string): string {
  const requested = new URLSearchParams(search).get('nation');
  return requested && validNationIds.includes(requested) ? requested : fallbackId;
}
export function sceneUrl(href: string, scene: SceneView, nationId?: string): string {
  const url = new URL(href);
  url.searchParams.set('view', scene);
  if (scene === 'nation' || scene === 'world') {
    if (nationId) url.searchParams.set('nation', nationId);
  } else url.searchParams.delete('nation');
  return url.href;
}
