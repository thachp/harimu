export const viewModes = ['world', 'square', 'home', 'workplace', 'market', 'government', 'nation', 'planning'] as const;
export type SceneView = typeof viewModes[number];
export function sceneFromSearch(search: string): SceneView {
  const view = new URLSearchParams(search).get('view');
  return viewModes.includes(view as SceneView) ? view as SceneView : 'square';
}
export function sceneUrl(href: string, scene: SceneView, nationId?: string): string {
  const url = new URL(href);
  url.searchParams.set('view', scene);
  if (scene === 'nation' && nationId) url.searchParams.set('nation', nationId);
  else url.searchParams.delete('nation');
  return url.href;
}
