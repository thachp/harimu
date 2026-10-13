import assert from 'node:assert/strict';
import { clampCamera, clampZoom, readCameraSnapshot, saveCameraSnapshot, cityLocations, locationSelection } from '../lib/game-viewport.ts';
assert.equal(clampCamera(40), 10); assert.equal(clampCamera(-40), -10); assert.equal(clampCamera(NaN), 0);
assert.equal(clampZoom(9), 2.8); assert.equal(clampZoom(-1), .65); assert.equal(clampZoom(NaN), 1);
assert.equal(new Set(cityLocations.map(p => p.id)).size, 5);
for (const place of cityLocations) assert.equal(locationSelection(place.id).location, place.id);
console.log('Viewport camera bounds and location mapping passed');

saveCameraSnapshot('city:kindle', { x: 4, z: -3, zoom: 1.7 }, 14);
assert.deepEqual(readCameraSnapshot('city:kindle', 14), { x: 4, z: -3, zoom: 1.7 });
assert.deepEqual(readCameraSnapshot('world:kindle', 18), { x: 0, z: 0, zoom: 1 });
assert.deepEqual(readCameraSnapshot('city:kindle', 2), { x: 2, z: -2, zoom: 1.7 });
for (let i = 0; i < 11; i++) saveCameraSnapshot(`city:test${i}`, { x: i, z: 0, zoom: 1 }, 14);
assert.deepEqual(readCameraSnapshot('city:kindle', 14), { x: 0, z: 0, zoom: 1 });
console.log('Camera remount snapshots, bounds, context isolation and eviction passed');
