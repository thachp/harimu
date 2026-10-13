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

const { createRegionWorld, globePoint, globeNationCoordinates } = await import('../lib/game-art.ts');
const nations = Array.from({ length: 10 }, (_, i) => ({ id: `nation-${i}`, name: `Nation ${i}` }));
const globe = createRegionWorld(nations);
assert.equal(globe.selectables.length, 10);
assert.equal(new Set(globe.selectables.map(marker => marker.userData.nationId)).size, 10);
assert.equal(globe.group.children[0].geometry.type, 'SphereGeometry');
const surface = globe.group.children[0].material.map;
assert.equal(surface.image.width, 2048); assert.equal(surface.image.height, 1024);
assert.equal(surface.colorSpace, 'srgb');
for (let i = 0; i < 10; i++) {
  const { latitude, longitude } = globeNationCoordinates(i, 10);
  assert.ok(Math.abs(globePoint(latitude, longitude).length() - 7) < 1e-10);
  assert.ok(globe.selectables[i].position.length() > 7);
}
assert.ok(new Set(surface.image.data).size > 100);
assert.equal(surface.image.data[3], 255);
assert.equal(surface.generateMipmaps, true);
console.log('Procedural spherical world, fictional nation markers and surface colors passed');
