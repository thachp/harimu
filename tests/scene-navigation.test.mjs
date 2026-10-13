import assert from 'node:assert/strict';
import { isSceneTraversal, sceneHistoryState, sceneFromSearch, sceneUrl, viewModes } from '../lib/scene-navigation.ts';
assert.equal(sceneFromSearch(''), 'square');
assert.equal(sceneFromSearch('?view=unknown'), 'square');
for (const view of viewModes) {
  const url = sceneUrl('https://harimu.com/?preview=1&nation=kindle', view, 'korund');
  assert.equal(sceneFromSearch(new URL(url).search), view);
  assert.equal(new URL(url).searchParams.get('preview'), '1');
  assert.equal(new URL(url).searchParams.get('nation'), view === 'nation' ? 'korund' : null);
}
// Browser history restores views entirely from URLs, without a stale component override.
const history = ['https://harimu.com/'];
for (const scene of ['home', 'workplace', 'market', 'home']) history.push(sceneUrl(history.at(-1), scene));
assert.deepEqual(history.map(url => sceneFromSearch(new URL(url).search)), ['square', 'home', 'workplace', 'market', 'home']);
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
