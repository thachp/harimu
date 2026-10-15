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

export type LabelBox = { x: number; y: number; w: number; h: number };
/**
 * #377: keep scene labels readable on a phone. Each box is anchored at its bottom centre (x, y), the way the viewport draws it. Returns the same boxes
 * moved so that none leaves the area (a label at the edge was cut off) and, when two would overlap, the later one is stepped up or down by one label
 * height until it is clear (a label was hidden behind others). Boxes that already fit are returned unchanged, so uncrowded desktop scenes do not move.
 */
export function placeLabels(boxes: LabelBox[], area: { w: number; h: number }, gap = 4): LabelBox[] {
  const placed: LabelBox[] = [];
  const clampX = (b: LabelBox, x: number) => b.w + gap * 2 > area.w ? area.w / 2 : Math.max(b.w / 2 + gap, Math.min(area.w - b.w / 2 - gap, x));
  const clampY = (b: LabelBox, y: number) => Math.max(b.h + gap, Math.min(area.h - gap, y));
  const clashes = (a: LabelBox) => placed.filter(b => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap && Math.abs((a.y - a.h / 2) - (b.y - b.h / 2)) < (a.h + b.h) / 2 + gap).length;
  for (const box of boxes) {
    const start = { ...box, x: clampX(box, box.x), y: clampY(box, box.y) };
    // Try the spot itself, then steps up or down by one label height (and sideways by half a label), nearest first; keep the least-crowded spot if none is clear.
    const tries = [0, 1, -1, 2, -2, 3, -3, 4, -4].flatMap(row => [0, 1, -1, 2, -2].map(col => ({ row, col }))).sort((a, b) => Math.abs(a.row) * 2 + Math.abs(a.col) - Math.abs(b.row) * 2 - Math.abs(b.col));
    let best = start, fewest = clashes(start);
    for (const { row, col } of tries) {
      if (!fewest) break;
      const spot = { ...box, x: clampX(box, start.x + col * (box.w / 2 + gap)), y: clampY(box, start.y + row * (box.h + gap)) }, n = clashes(spot);
      if (n < fewest) { best = spot; fewest = n; }
    }
    placed.push(best);
  }
  return placed;
}
