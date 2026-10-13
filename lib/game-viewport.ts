export type LocationId = 'square' | 'home' | 'workplace' | 'market' | 'government';
export type ViewportSelection = { kind: 'tile' | 'building' | 'nation'; label: string; detail: string; location?: LocationId; nationId?: string };
export const cityLocations: { id: LocationId; label: string; detail: string; x: number; z: number }[] = [
  { id: 'square', label: 'City', detail: 'Meet your neighbours and read the local notices.', x: 0, z: 0 },
  { id: 'home', label: 'Your household', detail: 'Food, belongings and recovery.', x: -4, z: 2 },
  { id: 'workplace', label: 'Workplace', detail: 'Choose a shift and collect earned wages.', x: 4, z: 2 },
  { id: 'market', label: 'Market', detail: 'Visit merchant stalls and citizen listings.', x: -4, z: -3 },
  { id: 'government', label: 'Government district', detail: 'Review officials’ decisions and submit a petition.', x: 4, z: -3 },
];
export function clampCamera(value: number, limit = 10) { return Math.max(-limit, Math.min(limit, Number.isFinite(value) ? value : 0)); }
export function clampZoom(value: number) { return Math.max(0.65, Math.min(2.8, Number.isFinite(value) ? value : 1)); }
export function locationSelection(id: LocationId, nationId?: string): ViewportSelection {
  const place = cityLocations.find((entry) => entry.id === id)!;
  if (nationId === 'korund' && id === 'market') return { kind: 'building', label: 'State ration store', detail: 'Redeem your non-transferable ration coupons while supply lasts.', location: id };
  if (nationId === 'korund' && id === 'workplace') return { kind: 'building', label: 'Assignment board', detail: 'Complete your assigned brigade shift and collect Labor Notes.', location: id };
  return { kind: 'building', label: place.label, detail: place.detail, location: id };
}

export type CameraSnapshot = { x: number; z: number; zoom: number };
// View geometry only: never store an account identifier or citizen state here.
const cameras = new Map<string, CameraSnapshot>();
export function readCameraSnapshot(key: string, bounds: number): CameraSnapshot {
  const snapshot = cameras.get(key) ?? { x: 0, z: 0, zoom: 1 };
  return { x: clampCamera(snapshot.x, bounds), z: clampCamera(snapshot.z, bounds), zoom: clampZoom(snapshot.zoom) };
}
export function saveCameraSnapshot(key: string, snapshot: CameraSnapshot, bounds: number) {
  cameras.delete(key);
  cameras.set(key, { x: clampCamera(snapshot.x, bounds), z: clampCamera(snapshot.z, bounds), zoom: clampZoom(snapshot.zoom) });
  if (cameras.size > 11) cameras.delete(cameras.keys().next().value!);
}
