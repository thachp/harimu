import assert from 'node:assert/strict';
import { isSceneTraversal, sceneHistoryState, sceneFromSearch, sceneUrl, nationFromSearch, viewModes, identityHold, signedInHint, viewedNationHeld, validNationInSearch, identityHoldTimeoutMs } from '../lib/scene-navigation.ts';
assert.equal(sceneFromSearch(''), 'square');
assert.equal(sceneFromSearch('?view=unknown'), 'square');
for (const view of viewModes) {
  const url = sceneUrl('https://harimu.com/?preview=1&nation=kindle', view, 'korund');
  assert.equal(sceneFromSearch(new URL(url).search), view);
  assert.equal(new URL(url).searchParams.get('preview'), '1');
  assert.equal(new URL(url).searchParams.get('nation'), ['world','nation','country'].includes(view) ? 'korund' : null);
}
// Browser history restores views entirely from URLs, without a stale component override.
const history = ['https://harimu.com/'];
for (const scene of ['household', 'workplace', 'market', 'household']) history.push(sceneUrl(history.at(-1), scene));
assert.deepEqual(history.map(url => sceneFromSearch(new URL(url).search)), ['square', 'household', 'workplace', 'market', 'household']);
assert.equal(sceneFromSearch(new URL(history[2]).search), 'workplace');
const routerState = { __vinext_scrollY: 42, snapshot: { route: '/' } };
const sceneState = sceneHistoryState(routerState, '/');
assert.equal(sceneState.__vinext_scrollY, 42);
assert.equal(sceneState.snapshot, routerState.snapshot);
assert.equal(isSceneTraversal(sceneState, '/'), true);
assert.equal(isSceneTraversal(sceneState, '/other'), false);
assert.equal(isSceneTraversal(routerState, '/'), false);
assert.equal(isSceneTraversal(null, '/'), false);
assert.equal(isSceneTraversal(sceneHistoryState(null, '/'), '/'), true);
console.log('Scene navigation: default, deep links, retained parameters, history restoration passed');

assert.equal(sceneFromSearch('?view=home'), 'household');
assert.equal(sceneFromSearch('?view=planning'), 'household');
assert.equal(new URL(sceneUrl('https://harimu.com/?view=planning', 'household')).searchParams.get('view'), 'household');

// Inspecting foreign institutions must never alter the citizen's realm.
const citizenNation = 'kindle', nationIds = ['kindle','korund','aurelle'];
const nationHistory = ['https://harimu.com/?view=world&nation=kindle&source=fixture'];
nationHistory.push(sceneUrl(nationHistory.at(-1),'world','korund'));
nationHistory.push(sceneUrl(nationHistory.at(-1),'nation','korund'));
nationHistory.push(sceneUrl(nationHistory.at(-1),'nation','aurelle'));
assert.deepEqual(nationHistory.map(url => nationFromSearch(new URL(url).search,nationIds,citizenNation)),
  ['kindle','korund','korund','aurelle']);
assert.equal(nationFromSearch(new URL(nationHistory[2]).search,nationIds,citizenNation),'korund','Back restores inspected Korund');
assert.equal(nationFromSearch(new URL(nationHistory[3]).search,nationIds,citizenNation),'aurelle','Forward restores inspected Aurelle');
for (const url of nationHistory) assert.equal(new URL(url).searchParams.get('source'),'fixture');
assert.equal(nationFromSearch('?view=nation&nation=unknown',nationIds,citizenNation),'kindle');
assert.equal(nationFromSearch('?view=nation&nation=',nationIds,citizenNation),'kindle');
assert.equal(nationFromSearch('?view=world',nationIds,'aurelle'),'aurelle');
assert.equal(new URL(sceneUrl(nationHistory.at(-1),'household',citizenNation)).searchParams.get('nation'),null);
assert.equal(citizenNation,'kindle');

assert.equal(sceneFromSearch('?view=city'),'square','City alias retains legacy square route');
const cityVisit=sceneUrl('https://harimu.com/?view=country&nation=korund','square','korund','farim-rice');
assert.equal(new URL(cityVisit).searchParams.get('city'),'farim-rice');
assert.equal(new URL(cityVisit).searchParams.get('nation'),'korund','Sample city refresh retains its exploration nation');

// #55: switching nations must not carry the previous nation's city forward.
{
  const stale = 'https://harimu.com/?view=square&nation=kindle&city=forgehaven';
  assert.equal(new URL(sceneUrl(stale, 'country', 'confluence')).searchParams.get('city'), null);
  assert.equal(new URL(sceneUrl(stale, 'government', 'confluence')).searchParams.get('city'), null);
  const kept = new URL(sceneUrl(stale, 'square', 'confluence', 'meetwater'));
  assert.equal(kept.searchParams.get('city'), 'meetwater');
  assert.equal(kept.searchParams.get('nation'), 'confluence');
}

// #56: Back to an entry whose state the framework rewrote (marker lost) stays in-game.
{
  const { isGamePopstate } = await import('../lib/scene-navigation.ts');
  assert.equal(isSceneTraversal({ __NA: true }, '/'), false);
  assert.equal(isGamePopstate('/', '/'), true);
  assert.equal(isGamePopstate('/', '/sign-in'), false);
}

// #90: stale or invalid deep-link params are dropped instead of crashing.
{
  const { normalizeSceneSearch } = await import('../lib/scene-navigation.ts');
  const { cityForNation } = await import('../lib/cities.ts');
  const nations = ['kindle', 'confluence', 'korund'];
  const inNation = (n, c) => Boolean(cityForNation(n, c));
  // City that does not belong to the nation (the pre-#59 bookmark).
  assert.equal(normalizeSceneSearch('?view=government&nation=confluence&city=forgehaven', nations, inNation), '?view=government&nation=confluence');
  // Unknown nation drops nation, and a city that then belongs to no nation is dropped too.
  assert.equal(normalizeSceneSearch('?view=country&nation=atlantis&city=nowhere', nations, inNation), '?view=country');
  // Unknown nation keeps a real city; it is resolved against the citizen's nation later.
  assert.equal(normalizeSceneSearch('?nation=atlantis&city=forgehaven', nations, inNation), '?city=forgehaven');
  // Unknown view falls back to the default scene.
  assert.equal(normalizeSceneSearch('?view=bogus&preview=1', nations, inNation), '?preview=1');
  assert.equal(sceneFromSearch(normalizeSceneSearch('?view=bogus', nations, inNation)), 'square');
  // Valid links and legacy aliases are untouched.
  assert.equal(normalizeSceneSearch('?view=square&nation=kindle&city=forgehaven', nations, inNation), '?view=square&nation=kindle&city=forgehaven');
  assert.equal(normalizeSceneSearch('?view=planning', nations, inNation), '?view=planning');
  assert.equal(normalizeSceneSearch('', nations, inNation), '');
}

// #91: Country -> Civic with a foreign nation keeps the nation and is read-only.
{
  const { isForeignCivic } = await import('../lib/scene-navigation.ts');
  const country = 'https://harimu.com/?view=country&nation=confluence';
  const civic = new URL(sceneUrl(country, 'government', 'confluence', undefined, 'confluence' !== 'kindle'));
  assert.equal(civic.searchParams.get('view'), 'government');
  assert.equal(civic.searchParams.get('nation'), 'confluence');
  assert.equal(isForeignCivic('government', civic.searchParams.get('nation'), 'confluence', 'kindle'), true);
  assert.equal(isForeignCivic('government', civic.searchParams.get('nation'), 'confluence', null), true);
  // Own nation's Civic stays the citizen scene (no nation param, full actions).
  const own = new URL(sceneUrl('https://harimu.com/?view=country&nation=kindle', 'government', 'kindle', undefined, false));
  assert.equal(own.searchParams.get('nation'), null);
  assert.equal(isForeignCivic('government', own.searchParams.get('nation'), 'kindle', 'kindle'), false);
  assert.equal(isForeignCivic('government', 'kindle', 'kindle', 'kindle'), false);
  // Personal scenes never carry a foreign nation.
  assert.equal(new URL(sceneUrl(country, 'household', 'confluence', undefined, true)).searchParams.get('nation'), null);
}

// #455/#533: what the top bar says while a citizen row loads.
{
  const ids = ['kindle', 'korund', 'aurelle'];
  const hold = (search, loading, citizen, hint, expired) => identityHold(search, ids, loading, citizen, hint, expired);
  // Anonymous or signed-out: never a hold, even on the very first client render.
  assert.equal(hold('', true, false, 'signed-out'), 'none', 'a signed-out visitor never sees a loading line');
  assert.equal(hold('?view=workplace', true, false, 'signed-out'), 'none');
  // Server render and hydration (hint not known yet): neutral, never a nation or a loading line; a valid ?nation= is a visitor view.
  assert.equal(hold('', true, false, 'unknown'), 'neutral');
  assert.equal(hold('?nation=korund', true, false, 'unknown'), 'none');
  assert.equal(hold('?nation=atlantis', true, false, 'unknown'), 'neutral');
  // A returning citizen (signed-in hint): loading until the row is read, with or without a nation in the URL (no false "Nation preview").
  assert.equal(hold('', true, false, 'signed-in'), 'loading');
  assert.equal(hold('?view=nation&nation=kindle', true, false, 'signed-in'), 'loading', 'a shared ?nation= link no longer flashes the visited nation as the top bar');
  // Ends: row read, citizen known, error/anonymous status (not loading), or the timeout.
  for (const hint of ['unknown', 'signed-in']) { assert.equal(hold('', false, false, hint), 'none'); assert.equal(hold('', true, true, hint), 'none'); assert.equal(hold('', true, false, hint, true), 'none', `${hint}: timed out`); }
  assert.ok(identityHoldTimeoutMs >= 3000 && identityHoldTimeoutMs <= 15000, 'a few seconds');
  // Viewed-nation labels (breadcrumb nation and city) are held only while a hold is on and the URL names no nation, so a legitimate visitor view keeps its names.
  assert.equal(viewedNationHeld('loading', '', ids), true); assert.equal(viewedNationHeld('neutral', '?view=square', ids), true);
  assert.equal(viewedNationHeld('loading', '?nation=kindle', ids), false, 'a visited nation keeps its own name');
  assert.equal(viewedNationHeld('none', '', ids), false);
  assert.equal(validNationInSearch('?nation=korund', ids), true); assert.equal(validNationInSearch('?nation=x', ids), false); assert.equal(validNationInSearch('', ids), false);
  // Clerk's __client_uat cookie: a unix time means signed in, 0 or absent means signed out, no cookie string means unknown.
  assert.equal(signedInHint('__client_uat=1760500000; other=1'), 'signed-in');
  assert.equal(signedInHint('a=b; __client_uat_Ab12Cd=1760500000'), 'signed-in', 'suffixed cookie of newer Clerk versions');
  assert.equal(signedInHint('__client_uat=0'), 'signed-out'); assert.equal(signedInHint('__client_uat_Ab12Cd=0; __client_uat=0'), 'signed-out');
  assert.equal(signedInHint(''), 'signed-out'); assert.equal(signedInHint('theme=dark; session=abc'), 'signed-out');
  assert.equal(signedInHint('__client_uat='), 'signed-out'); assert.equal(signedInHint('__client_uat=abc'), 'signed-out'); assert.equal(signedInHint('xx__client_uat=1760500000'), 'signed-out', 'only the exact name or the suffixed one');
  assert.equal(signedInHint(undefined), 'unknown'); assert.equal(signedInHint(null), 'unknown');
  // Every nation's citizen link carries nation and city, Aurelle included (#455).
  for (const [nation, city] of [['kindle', 'forgehaven'], ['korund', 'stonehearth'], ['aurelle', 'highspire']]) {
    const url = new URL(sceneUrl('https://harimu.com/', 'workplace', nation, city));
    assert.equal(url.searchParams.get('nation'), nation); assert.equal(url.searchParams.get('city'), city); assert.equal(url.searchParams.get('view'), 'workplace');
  }
}

// #376: a guest or signed-out visitor keeps the nation they preview in every scene; a citizen's personal scenes still do not carry a nation.
{
  const guest = 'https://harimu.com/?view=city&nation=kindle';
  for (const view of viewModes) {
    const url = new URL(sceneUrl(guest, view, 'kindle', undefined, true, true));
    assert.equal(url.searchParams.get('view'), view); assert.equal(url.searchParams.get('nation'), 'kindle', `visitor ${view} keeps nation`);
    assert.equal(url.searchParams.get('city'), null);
  }
  const work = sceneUrl(guest, 'workplace', 'korund', undefined, true, true), market = sceneUrl(work, 'market', 'korund', undefined, true, true);
  assert.equal(new URL(market).search, '?view=market&nation=korund', 'Work then Market on a previewed nation');
  assert.equal(nationFromSearch(new URL(market).search, ['kindle', 'korund', 'aurelle'], 'kindle'), 'korund', 'a reload reads the same nation back');
  for (const view of ['household', 'workplace', 'market', 'square']) {
    assert.equal(new URL(sceneUrl(guest, view, 'kindle', undefined, false, false)).searchParams.get('nation'), null, `a citizen's ${view} scene stays out of the URL`);
    assert.equal(new URL(sceneUrl(guest, view, 'confluence', undefined, true, false)).searchParams.get('nation'), null, `a citizen's ${view} link never carries a foreign nation`);
  }
  assert.equal(new URL(sceneUrl(guest, 'workplace', undefined, undefined, true, true)).searchParams.get('nation'), null, 'no nation id, nothing to keep');
}
