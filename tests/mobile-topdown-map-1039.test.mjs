/** #1039: below the #847 phone breakpoint, and only when NEXT_PUBLIC_HARIMU_MOBILE_TOPDOWN_MAP is exactly "true",
 *  the map camera is orthographic and straight down. Desktop and flag-off keep the tilted view. Tap still selects. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { expandFlagPacks, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { createCityWorld, globeAnchorVisible, globeFocusRotation, globePoint } from '../lib/game-art.ts';
import { projectOwnershipCells } from '../lib/globe-mapping.ts';
import { cityPanDelta, controlPan, mapEffects, mobileTopdownMapEnabled, MOBILE_MAP_MAX_WIDTH, MOBILE_MAP_QUERY, orientWorldGroup, overlayFacing, phoneWidth, placeMapCamera, selectMapView } from '../lib/mobile-topdown-map.ts';
import { dashboardManagedVars } from '../scripts/wrangler-pin.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const read = path => readFileSync(path, 'utf8');
const key = 'NEXT_PUBLIC_HARIMU_MOBILE_TOPDOWN_MAP';
const graphics = { antialias: true, shadows: true, pixelRatio: 2 };

test('flag is exactly "true", packed, preview on, production off, and text-binding headroom stays at least 3', () => {
  assert.equal(mobileTopdownMapEnabled('true'), true);
  for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(mobileTopdownMapEnabled(value), false);
  const preview = strip(read('wrangler.jsonc')), prod = strip(read('wrangler.prod.jsonc'));
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(varsForProcessEnv(prod.vars)[key], 'false');
  assert.match(read('tests/wrangler-prod-501b.test.mjs'), /NEXT_PUBLIC_HARIMU_MOBILE_TOPDOWN_MAP/);
  const outside = dashboardManagedVars.filter(name => !(name in preview.vars));
  const previewTotal = Object.keys(preview.vars).length + outside.length + 2;
  assert.ok(127 - previewTotal >= 3, `preview headroom ${127 - previewTotal}`);
});

test('the #847 breakpoint selects top-down only on a phone with the flag on', () => {
  assert.equal(MOBILE_MAP_QUERY, '(max-width: 760px)'); assert.equal(MOBILE_MAP_MAX_WIDTH, 760);
  assert.match(read('app/game-shell.css'), /@media\(max-width:760px\)/);
  assert.equal(selectMapView('true', phoneWidth(390)), 'topdown');
  assert.equal(selectMapView('true', phoneWidth(760)), 'topdown');
  assert.equal(selectMapView('true', phoneWidth(761)), 'desktop');
  assert.equal(selectMapView('true', phoneWidth(1280)), 'desktop');
  for (const flag of ['false', undefined, 'TRUE']) assert.equal(selectMapView(flag, phoneWidth(390)), 'desktop');
  const vp = read('app/game-viewport.tsx');
  assert.match(vp, /selectMapView\(process\.env\.NEXT_PUBLIC_HARIMU_MOBILE_TOPDOWN_MAP/);
  assert.doesNotMatch(vp, /camera\.position\.lerp|quaternion\.slerp|beginCameraAnimation/);
  assert.match(read('lib/mobile-topdown-map.ts'), /no camera animation/i);
});

test('top-down looks straight down with lighter effects; desktop keeps the tilted pose and full effects', () => {
  const camera = new THREE.OrthographicCamera(-16, 16, 12, -12, .1, 120);
  const direction = () => camera.getWorldDirection(new THREE.Vector3());
  placeMapCamera(camera, 'topdown', 'city', { x: 2, y: 0, z: -3 }); camera.updateMatrixWorld();
  const down = direction();
  assert.ok(Math.abs(down.x) < 1e-6 && Math.abs(down.z) < 1e-6 && down.y < -.99, 'city top-down has no tilt');
  assert.ok(camera.isOrthographicCamera);
  assert.equal(camera.position.x, 2); assert.equal(camera.position.z, -3); assert.ok(camera.position.y > 20);
  placeMapCamera(camera, 'desktop', 'city', { x: 2, y: 0, z: -3 }); camera.updateMatrixWorld();
  const tilt = direction();
  assert.ok(Math.abs(tilt.x) > .2 && Math.abs(tilt.z) > .2 && tilt.y < 0, 'desktop city stays oblique');
  assert.equal(camera.position.x, 25); assert.equal(camera.position.y, 28); assert.equal(camera.position.z, 20);
  placeMapCamera(camera, 'topdown', 'world', { x: 0, y: 0, z: 0 }); camera.updateMatrixWorld();
  const over = direction();
  assert.ok(Math.abs(over.x) < 1e-6 && Math.abs(over.z) < 1e-6 && over.y < -.99);
  assert.equal(camera.position.y, 25); assert.equal(camera.position.z, 0);
  placeMapCamera(camera, 'desktop', 'world', { x: 0, y: 0, z: 0 }); camera.updateMatrixWorld();
  const side = direction();
  assert.ok(Math.abs(side.x) < 1e-6 && Math.abs(side.y) < 1e-6 && side.z < -.99, 'desktop world still looks along -Z');
  assert.equal(camera.position.z, 25); assert.equal(camera.position.y, 0);
  const light = mapEffects('topdown', graphics), full = mapEffects('desktop', graphics);
  assert.deepEqual([light.fog, light.shadows, light.atmosphere, light.antialias, light.pixelRatio, light.sun], [false, false, false, false, 1, 1.5]);
  assert.equal(full.fog && full.shadows && full.atmosphere && full.antialias && full.pixelRatio === 2 && full.sun === 3.2, true);
  assert.deepEqual(controlPan('desktop', 'city', 'left'), [-1, 1]);
  assert.deepEqual(controlPan('desktop', 'world', 'up'), [0, -.15]);
  assert.deepEqual(controlPan('topdown', 'world', 'left'), [-.22, 0], 'world nudges do not change on a phone');
});

test('top-down city drag follows the finger, and a tap selects the square and a building', () => {
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, .1, 80);
  const target = { x: 0, y: 0, z: 0 };
  const project = (x, z) => new THREE.Vector3(x, 0, z).project(camera).clone();
  placeMapCamera(camera, 'topdown', 'city', target); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  const origin = project(0, 0);
  const [px, pz] = cityPanDelta('topdown', 10, 0, 1);
  target.x += px; target.z += pz;
  placeMapCamera(camera, 'topdown', 'city', target); camera.updateMatrixWorld();
  assert.ok(project(0, 0).x > origin.x + .01, 'drag right moves the ground right');
  const mid = project(0, 0);
  const [, dz] = cityPanDelta('topdown', 0, 10, 1);
  target.x += 0; target.z += dz;
  placeMapCamera(camera, 'topdown', 'city', target); camera.updateMatrixWorld();
  assert.ok(project(0, 0).y < mid.y - .01, 'drag down moves the ground down');
  assert.deepEqual(cityPanDelta('desktop', 4, -2, 1), [(-4 - -2) * .65, (4 - -2) * .65]);
  const world = createCityWorld('kindle'); world.group.updateMatrixWorld(true);
  const hitAt = (ndcX, ndcY) => {
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const hit = ray.intersectObjects(world.selectables, true)[0];
    let object = hit?.object; while (object && !object.userData.kind) object = object.parent;
    return object?.userData;
  };
  placeMapCamera(camera, 'topdown', 'city', { x: 0, y: 0, z: 0 }); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  assert.equal(hitAt(0, 0).location, 'square');
  const home = world.buildings.find(b => b.location === 'home');
  const homeNdc = home.position.clone().project(camera);
  assert.equal(hitAt(homeNdc.x, homeNdc.y).location, 'home');
  placeMapCamera(camera, 'desktop', 'city', { x: 0, y: 0, z: 0 }); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  const squareNdc = new THREE.Vector3(0, 1, 0).project(camera);
  assert.equal(hitAt(squareNdc.x, squareNdc.y).location, 'square', 'desktop tap still selects the square');
});

test('top-down keeps nation markers and ownership cells on the facing side', () => {
  const point = globePoint(20, 40, 7.22);
  const rotation = globeFocusRotation(point);
  const group = new THREE.Group();
  orientWorldGroup(group, 'topdown', rotation.y, rotation.x); group.updateMatrixWorld();
  const faced = point.clone().applyMatrix4(group.matrixWorld);
  assert.ok(faced.y > 7 && Math.abs(faced.x) < 1e-6 && Math.abs(faced.z) < 1e-6, 'the focused city faces the overhead camera');
  assert.equal(globeAnchorVisible(faced, 'y'), true);
  assert.equal(overlayFacing('topdown', 'world'), 'y'); assert.equal(overlayFacing('desktop', 'world'), 'z'); assert.equal(overlayFacing('topdown', 'city'), 'z');
  const camera = new THREE.OrthographicCamera(-16, 16, 12, -12, .1, 120);
  placeMapCamera(camera, 'topdown', 'world', { x: 0, y: 0, z: 0 }); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  const desk = new THREE.Group(); desk.rotation.set(0, 0, 0); desk.updateMatrixWorld();
  const deskCamera = new THREE.OrthographicCamera(-16, 16, 12, -12, .1, 120);
  placeMapCamera(deskCamera, 'desktop', 'world', { x: 0, y: 0, z: 0 }); deskCamera.updateProjectionMatrix(); deskCamera.updateMatrixWorld();
  const cells = [[14, 11], [0, 11]];
  const top = projectOwnershipCells({ width: 30, height: 24 }, cells, group, camera, { w: 800, h: 600 }, new THREE.Vector3(), 'y');
  const flat = projectOwnershipCells({ width: 30, height: 24 }, cells, desk, deskCamera, { w: 800, h: 600 }, new THREE.Vector3());
  assert.equal(top[0].hidden, false, 'a facing ownership cell stays visible overhead');
  assert.equal(flat[1].hidden, true, 'the desktop back hemisphere stays hidden');
  assert.equal(globeAnchorVisible(faced.clone().negate(), 'y'), false, 'the far side stays hidden overhead');
  assert.ok(Number.isFinite(top[0].left) && Number.isFinite(top[0].top));
});
