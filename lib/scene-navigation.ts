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
const inspectingViews: readonly string[] = ['world', 'country', 'nation'];
// A new personal scene must be added to personalViews (and a new inspecting scene to inspectingViews), or it silently inherits the inspected nation.
const personalViews: readonly string[] = ['square', 'household', 'workplace', 'market'];
/** #527: which nation a navigation to `nextView` shows. A citizen inspecting another nation on World, Country or Nation keeps it there; the inspection ends when they
 *  open a personal scene (City, Household, Work, Market), or Country or Civic from a personal scene, which are their own nation again. Otherwise a stale inspected
 *  nation survived the walk and Civic opened that nation's government and the URLs dropped nation and city. Civic opened straight from an inspection stays read-only (#91). */
export function nationForNavigation(nextView: string, currentView: string, viewedNationId: string, citizenNationId: string | null | undefined): string {
  if (!citizenNationId) return viewedNationId;
  if (personalViews.includes(nextView)) return citizenNationId;
  if ((nextView === 'country' || nextView === 'government') && !inspectingViews.includes(currentView)) return citizenNationId;
  return viewedNationId;
}
/** #533 (follow-up to #455/#523): what the top bar says while the citizen row loads.
 *  `hint` is what the browser knows before Clerk loads, read from Clerk's non-HttpOnly `__client_uat` cookie (see `signedInHint`); `unknown` only until the first client effect (server render, hydration).
 *  - session not loading, citizen known, signed-out hint, or the hold timed out (`expired`): `none`, the normal identity line (an anonymous visitor never sees a loading line, and a stalled Clerk or /api/citizen ends the hold).
 *  - signed-in hint: `loading` ("Loading your citizen…"), even when the URL names another nation, because the top bar shows the citizen's own nation, never the visited one (no false "Nation preview").
 *  - unknown hint: a valid `?nation=` is a visitor view and shows at once (`none`); otherwise `neutral` (no nation and no status text), so the server render never says Kindle or "Loading your citizen…". */
export type SignedInHint = 'unknown' | 'signed-in' | 'signed-out';
export type IdentityHold = 'none' | 'neutral' | 'loading';
export const identityHoldTimeoutMs = 8000;
export function signedInHint(cookie: string | null | undefined): SignedInHint {
  if (typeof cookie !== 'string') return 'unknown';
  for (const part of cookie.split(';')) {
    const eq = part.indexOf('=');
    const name = (eq < 0 ? part : part.slice(0, eq)).trim();
    if (name !== '__client_uat' && !name.startsWith('__client_uat_')) continue;
    const value = eq < 0 ? '' : part.slice(eq + 1).trim();
    if (/^[1-9][0-9]*$/.test(value)) return 'signed-in';
  }
  return 'signed-out';
}
/** #551: the cookie hint read, safe where `document.cookie` throws (a sandboxed iframe without allow-same-origin, or cookies blocked by the browser: SecurityError). It runs during render, so a throw
 *  left the page blank. On any error the hint is `unknown`; the hold then ends by the Clerk status or the timeout, as for any unknown hint. `read` is `() => document.cookie`. */
export function readSignedInHint(read: () => string | null | undefined): SignedInHint {
  try { return signedInHint(read()); } catch { return 'unknown'; }
}
export function validNationInSearch(search: string, validNationIds: readonly string[]): boolean {
  const requested = new URLSearchParams(search).get('nation');
  return Boolean(requested && validNationIds.includes(requested));
}
export function identityHold(search: string, validNationIds: readonly string[], sessionLoading: boolean, hasCitizenNation: boolean, hint: SignedInHint, expired = false): IdentityHold {
  if (!sessionLoading || hasCitizenNation || expired || hint === 'signed-out') return 'none';
  if (hint === 'signed-in') return 'loading';
  return validNationInSearch(search, validNationIds) ? 'none' : 'neutral';
}
/** The viewed-nation labels (breadcrumb nation and city, inspector label) are held only while a hold is on and the URL names no nation of its own. */
export function viewedNationHeld(hold: IdentityHold, search: string, validNationIds: readonly string[]): boolean {
  return hold !== 'none' && !validNationInSearch(search, validNationIds);
}
/** #543 (follow-up to #376): is this session a visitor for scene URLs, so every scene keeps the previewed `nation=`? Yes with no citizen when the session is anonymous or the local demo,
 *  and also when it is `ready` but has no citizen row yet (a new account previewing nations before choosing citizenship). Never while `loading` or `error` (the citizen may exist but is not known yet,
 *  and pinning the default nation then would defeat #411), and never for a citizen. */
export function isVisitorSession(hasCitizenNation: boolean, clerkConfigured: boolean, status: 'loading' | 'anonymous' | 'ready' | 'error'): boolean {
  return !hasCitizenNation && (!clerkConfigured || status === 'anonymous' || status === 'ready');
}
/** #379: who may use the first-visit guide, its "Try a day in the life" sample and the guest sandbox: everyone who is a visitor (isVisitorSession), which is a signed-out guest and also a signed-in account that has no citizen yet ("ready", no citizen row), plus the browser-local demo. Never a citizen, never while the session is loading or errored. */
export function guestDemoAllowed(hasCitizenNation: boolean, clerkConfigured: boolean, status: 'loading' | 'anonymous' | 'ready' | 'error'): boolean {
  return !clerkConfigured || isVisitorSession(hasCitizenNation, clerkConfigured, status);
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
