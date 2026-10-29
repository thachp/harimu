/** #1039: below the #847 phone breakpoint the map is a fixed straight-down orthographic view.
 *  NEXT_PUBLIC_HARIMU_MOBILE_TOPDOWN_MAP must be exactly "true" (HARIMU_UI_PACK: preview on, production off).
 *  The pose is assigned in one step. There is no camera animation, including when reduced motion is set. */
import * as THREE from 'three';

export const MOBILE_MAP_QUERY = '(max-width: 760px)'; // same match the shell and the viewport already use for phones (#847)
export const MOBILE_MAP_MAX_WIDTH = 760;
export type MapView = 'desktop' | 'topdown';
export type MapScene = 'world' | 'city';
export type PanDir = 'left' | 'right' | 'up' | 'down';

export function mobileTopdownMapEnabled(value: string | undefined = process.env.NEXT_PUBLIC_HARIMU_MOBILE_TOPDOWN_MAP): boolean {
  return value === 'true';
}
/** `phone` is true at the #847 breakpoint (viewport widths <= 760, i.e. matchMedia max-width: 760px). */
export function selectMapView(flag: string | undefined, phone: boolean): MapView {
  return flag === 'true' && phone ? 'topdown' : 'desktop';
}
export const phoneWidth = (width: number) => width <= MOBILE_MAP_MAX_WIDTH;

type Graphics = { antialias: boolean; shadows: boolean; pixelRatio: number };
/** Top-down drops the oblique lighting extras (fog, shadows, atmosphere, full pixel ratio). Desktop returns the graphics setting unchanged. */
export function mapEffects(view: MapView, graphics: Graphics) {
  const full = view !== 'topdown';
  return { antialias: full && graphics.antialias, shadows: full && graphics.shadows, pixelRatio: full ? graphics.pixelRatio : 1, fog: full, sun: full ? 3.2 : 1.5, atmosphere: full };
}

type Aim = { up: { set(x: number, y: number, z: number): void }; position: { set(x: number, y: number, z: number): void }; lookAt(x: number, y: number, z: number): void };
/** Desktop poses are the historical ones. Top-down looks along -Y (no tilt) and sets `up` so screen-up stays -Z. */
export function placeMapCamera(camera: Aim, view: MapView, scene: MapScene, target: { x: number; y: number; z: number }) {
  if (scene === 'world' && view === 'topdown') { camera.up.set(0, 0, -1); camera.position.set(0, 25, 0); camera.lookAt(0, 0, 0); return; }
  if (scene === 'world') { camera.up.set(0, 1, 0); camera.position.set(0, 0, 25); camera.lookAt(0, 0, 0); return; }
  if (view === 'topdown') { camera.up.set(0, 0, -1); camera.position.set(target.x, 40, target.z); camera.lookAt(target.x, 0, target.z); return; }
  camera.up.set(0, 1, 0); camera.position.set(target.x + 23, 28, target.z + 23); camera.lookAt(target.x, target.y, target.z);
}
/** Desktop keeps Euler (tilt, yaw, 0). Top-down applies that same facing, then a fixed −90° so the focus points at the overhead camera. */
export function orientWorldGroup(group: THREE.Object3D, view: MapView, yaw: number, tilt: number) {
  if (view !== 'topdown') { group.rotation.set(tilt, yaw, 0); return; }
  const facing = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, yaw, 0, 'XYZ'));
  group.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2).multiply(facing));
}
export function overlayFacing(view: MapView, scene: MapScene): 'z' | 'y' {
  return scene === 'world' && view === 'topdown' ? 'y' : 'z';
}
/** City drag. Desktop is the oblique mapping. Top-down moves the ground with the finger (screen right +X, screen down +Z). */
export function cityPanDelta(view: MapView, dx: number, dy: number, scale: number): [number, number] {
  if (view === 'topdown') return [-dx * scale, -dy * scale];
  return [(-dx - dy) * scale * .65, (dx - dy) * scale * .65];
}
/** Arrow and button nudges. Desktop numbers are unchanged. Top-down city steps stay on one axis. */
export function controlPan(view: MapView, scene: MapScene, dir: PanDir): [number, number] {
  if (scene === 'world') return dir === 'left' ? [-.22, 0] : dir === 'right' ? [.22, 0] : dir === 'up' ? [0, -.15] : [0, .15];
  if (view === 'topdown') return dir === 'left' ? [-1, 0] : dir === 'right' ? [1, 0] : dir === 'up' ? [0, -1] : [0, 1];
  return dir === 'left' ? [-1, 1] : dir === 'right' ? [1, -1] : dir === 'up' ? [-1, -1] : [1, 1];
}
