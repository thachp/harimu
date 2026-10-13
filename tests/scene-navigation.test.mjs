import assert from 'node:assert/strict';
import { isSceneTraversal, sceneHistoryState, sceneFromSearch, sceneUrl, nationFromSearch, viewModes } from '../lib/scene-navigation.ts';
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
