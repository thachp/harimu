import assert from 'node:assert/strict';
import { sceneFromSearch, sceneUrl, viewModes } from '../lib/scene-navigation.ts';
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
console.log('Scene navigation: default, deep links, retained parameters, history restoration passed');
