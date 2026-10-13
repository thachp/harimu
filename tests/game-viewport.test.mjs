import assert from 'node:assert/strict';
import { clampCamera, clampZoom, readCameraSnapshot, saveCameraSnapshot, cityLocations, locationSelection } from '../lib/game-viewport.ts';
assert.equal(clampCamera(40), 10); assert.equal(clampCamera(-40), -10); assert.equal(clampCamera(NaN), 0);
assert.equal(clampZoom(9), 2.8); assert.equal(clampZoom(-1), .65); assert.equal(clampZoom(NaN), 1);
assert.equal(new Set(cityLocations.map(p => p.id)).size, 5);
for (const place of cityLocations) assert.equal(locationSelection(place.id).location, place.id);
assert.equal(locationSelection('market', 'korund').label, 'State ration store');
assert.equal(locationSelection('workplace', 'korund').label, 'Assignment board');
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

// Every nation can be brought forward, including anchors initially behind the Earth.
const THREE = await import('three');
const { globeFocusRotation, globeAnchorVisible } = await import('../lib/game-art.ts');
const realIds = ['kindle', 'aurelle', 'ilmar', 'fulmara', 'confluence', 'meridian', 'korund', 'hoarvale', 'varkand', 'veldwood'];
const anchors = realIds.map((id, index) => ({ id, point: globePoint(...Object.values(globeNationCoordinates(index, 10)), 7.22) }));
assert.equal(new Set(anchors.map(({ point }) => point.toArray().join(','))).size, 10);
assert.ok(anchors.some(({ point }) => !globeAnchorVisible(point)));
for (const { id, point } of anchors) {
  const rotation = globeFocusRotation(point);
  const rotated = point.clone().applyEuler(new THREE.Euler(rotation.x, rotation.y, 0, 'XYZ'));
  assert.ok(globeAnchorVisible(rotated), `${id} must be visible when selected`);
  assert.ok(Math.abs(rotated.x) < 1e-10 && Math.abs(rotated.y) < 1e-10, `${id} must face camera centre`);
  assert.ok(rotated.z > 7);
  const camera = new THREE.OrthographicCamera(-12, 12, 9.3, -9.3, .1, 120);
  camera.position.set(0, 0, 25); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const projected = rotated.clone().project(camera);
  assert.ok(Math.abs(projected.x) < .98 && Math.abs(projected.y) < .98);
}
assert.equal(globeAnchorVisible(new THREE.Vector3(0, 0, -7.22)), false);
assert.equal(globeAnchorVisible(new THREE.Vector3(7.22, 0, 0)), false);
assert.equal(globeAnchorVisible(new THREE.Vector3(0, 0, 7.22)), true);
console.log('All ten anchors, front/back visibility, selection rotation and camera projection passed');
