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
/** #411: which nation the page views right after an existing citizen's profile loads. With no valid `nation` in the URL it is the citizen's own nation, so
 *  Civic opens their own government (editable) and no Kindle default applies. A valid `?nation=` keeps the visitor view of that nation. An unknown citizen nation changes nothing. */
export function viewedNationAfterLoad(search: string, validNationIds: readonly string[], citizenNationId: string | null | undefined, currentId: string): string {
  const requested = new URLSearchParams(search).get('nation');
  if (requested && validNationIds.includes(requested)) return currentId;
  return citizenNationId && validNationIds.includes(citizenNationId) ? citizenNationId : currentId;
}
/** #455: while a signed-in visitor's citizen row is still loading and the URL names no nation, the top bar must not claim the default (Kindle) nation:
 *  it holds a neutral loading line until the row is read, then shows the citizen's own nation. A valid `?nation=` is shown at once (a visitor view). */
export function identityPending(search: string, validNationIds: readonly string[], sessionLoading: boolean, hasCitizenNation: boolean): boolean {
  if (!sessionLoading || hasCitizenNation) return false;
  const requested = new URLSearchParams(search).get('nation');
  return !(requested && validNationIds.includes(requested));
}
/** #543 (follow-up to #376): is this session a visitor for scene URLs, so every scene keeps the previewed `nation=`? Yes with no citizen when the session is anonymous or the local demo,
 *  and also when it is `ready` but has no citizen row yet (a new account previewing nations before choosing citizenship). Never while `loading` or `error` (the citizen may exist but is not known yet,
 *  and pinning the default nation then would defeat #411), and never for a citizen. */
export function isVisitorSession(hasCitizenNation: boolean, clerkConfigured: boolean, status: 'loading' | 'anonymous' | 'ready' | 'error'): boolean {
  return !hasCitizenNation && (!clerkConfigured || status === 'anonymous' || status === 'ready');
}
/** `visitor` (#376): a guest or signed-out visitor has no citizen nation, so the nation they are previewing is the only one every scene shows; keep it in every scene's URL so a reload or shared link stays on it.
 *  A citizen's personal scenes always show their own nation, so for a citizen it stays out of the URL (`visitor` false). */
export function sceneUrl(href: string, scene: SceneView, nationId?: string, cityId?: string, keepNation = false, visitor = false): string {
  const url = new URL(href);
  url.searchParams.set('view', scene);
  if (scene === 'nation' || scene === 'world' || scene === 'country' || Boolean(cityId) || (keepNation && scene === 'government') || (visitor && Boolean(nationId))) {
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
const legacyViews = ['city', 'home', 'planning'];
/**
 * Drop unknown, stale or mismatched deep-link params (#90) so an old bookmark
 * falls back to a valid scene instead of crashing. Returns a `?query` string
 * ('' when nothing remains). Unrelated params are kept.
 */
export function normalizeSceneSearch(search: string, nationIds: readonly string[], cityInNation: (nationId: string, cityId: string) => boolean): string {
  let params: URLSearchParams;
  try { params = new URLSearchParams(search); } catch { return ''; }
  const view = params.get('view');
  if (view !== null && !viewModes.includes(view as SceneView) && !legacyViews.includes(view)) params.delete('view');
  const nation = params.get('nation');
  if (nation !== null && !nationIds.includes(nation)) params.delete('nation');
  const city = params.get('city');
  const validNation = params.get('nation');
  if (city !== null && (validNation ? !cityInNation(validNation, city) : !nationIds.some(id => cityInNation(id, city)))) params.delete('city');
  const out = params.toString();
  return out ? `?${out}` : '';
}
/** Civic for a nation the player is not a citizen of renders read-only (#91). */
export function isForeignCivic(view: SceneView, nationParam: string | null, viewedNationId: string, citizenNationId: string | null | undefined): boolean {
  return view === 'government' && Boolean(nationParam) && viewedNationId === nationParam && viewedNationId !== citizenNationId;
}
