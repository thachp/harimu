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
/** #379: a visitor has no household of their own, so "Your household" reads "Household" for them; citizens keep the label. */
export function locationLabel(id: LocationId, label: string, visitor = false) { return visitor && id === 'home' ? 'Household' : label; }
export function locationSelection(id: LocationId, nationId?: string, visitor = false): ViewportSelection {
  const place = cityLocations.find((entry) => entry.id === id)!;
  if (nationId === 'korund' && id === 'market') return { kind: 'building', label: 'State ration store', detail: 'Redeem your non-transferable ration coupons while supply lasts.', location: id };
  if (nationId === 'korund' && id === 'workplace') return { kind: 'building', label: 'Assignment board', detail: 'Complete your assigned brigade shift and collect Labor Notes.', location: id };
  return { kind: 'building', label: locationLabel(id, place.label, visitor), detail: place.detail, location: id };
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
 * height until it is clear (a label was hidden behind others). `blocked` boxes (same anchor convention) are fixed obstacles that labels also keep clear of. Boxes that already fit are returned unchanged, so uncrowded desktop scenes do not move.
 */
export function placeLabels(boxes: LabelBox[], area: { w: number; h: number }, gap = 4, blocked: LabelBox[] = []): LabelBox[] {
  const touch = (a: LabelBox, b: LabelBox) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap && Math.abs((a.y - a.h / 2) - (b.y - b.h / 2)) < (a.h + b.h) / 2 + gap;
  const crowded = (spots: LabelBox[], obstacles: LabelBox[]) => spots.some((a, i) => spots.slice(i + 1).some(b => touch(a, b)) || obstacles.some(o => touch(a, o)));
  const clear = solveLabels(boxes, area, gap, blocked);
  if (!blocked.length || !crowded(clear, blocked)) return clear;
  // On a very small canvas (320px wide) the labels cannot all fit around the breadcrumb: then labels at least keep apart from each other (a label under another is unreachable).
  const apart = solveLabels(boxes, area, gap, []);
  if (!crowded(apart, [])) return apart;
  // Still no room (five 44px labels in about 180px): fan them down the canvas, in the order of their buildings, overlapping a little but never hiding one another's centre.
  const byY = boxes.map((box, index) => index).sort((a, b) => boxes[a].y - boxes[b].y || a - b), result: LabelBox[] = [];
  const height = Math.max(...boxes.map(b => b.h)), pitch = Math.min(height + gap, Math.max(height / 2 + 2, (area.h - height - gap * 2) / Math.max(1, boxes.length - 1)));
  byY.forEach((index, rank) => { const b = boxes[index]; result[index] = { ...b, x: b.w + gap * 2 > area.w ? area.w / 2 : Math.max(b.w / 2 + gap, Math.min(area.w - b.w / 2 - gap, b.x)), y: Math.min(area.h - gap, gap + height + rank * pitch) }; });
  return result;
}
function solveLabels(boxes: LabelBox[], area: { w: number; h: number }, gap: number, blocked: LabelBox[]): LabelBox[] {
  const placed: LabelBox[] = [...blocked]; // fixed obstacles (the breadcrumb and shift chip over the canvas) that labels keep clear of; not returned
  const clampX = (b: LabelBox, x: number) => b.w + gap * 2 > area.w ? area.w / 2 : Math.max(b.w / 2 + gap, Math.min(area.w - b.w / 2 - gap, x));
  const clampY = (b: LabelBox, y: number) => Math.max(b.h + gap, Math.min(area.h - gap, y));
  const clashes = (a: LabelBox) => placed.filter(b => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap && Math.abs((a.y - a.h / 2) - (b.y - b.h / 2)) < (a.h + b.h) / 2 + gap).length;
  // Labels that start on an obstacle go first, while there is still room to put them somewhere clear; the rest keep their order.
  const hitsBlocked = (b: LabelBox) => blocked.some(o => Math.abs(b.x - o.x) < (b.w + o.w) / 2 + gap && Math.abs((b.y - b.h / 2) - (o.y - o.h / 2)) < (b.h + o.h) / 2 + gap);
  const order = boxes.map((box, index) => index).sort((a, b) => Number(hitsBlocked(boxes[b])) - Number(hitsBlocked(boxes[a])) || a - b);
  const result: LabelBox[] = [];
  for (const index of order) {
    const box = boxes[index];
    const start = { ...box, x: clampX(box, box.x), y: clampY(box, box.y) };
    // Candidate spots: the anchor itself, a grid over the whole canvas (half a label height up or down, a quarter label sideways), and the spots that sit flush against
    // each box already placed (above, below, left, right), so crowded rows pack tightly. Fewest clashes wins, then the spot nearest the anchor.
    const stepX = box.w / 4 + gap, stepY = (box.h + gap) / 2, reach = Math.ceil(area.h / stepY);
    const spots: { x: number; y: number }[] = [{ x: start.x, y: start.y }];
    for (let row = -reach; row <= reach; row++) for (let col = -6; col <= 6; col++) spots.push({ x: start.x + col * stepX, y: start.y + row * stepY });
    for (const o of placed) {
      for (const x of [start.x, o.x, o.x - o.w / 2 + box.w / 2, o.x + o.w / 2 - box.w / 2]) { spots.push({ x, y: o.y + gap + box.h }, { x, y: o.y - o.h - gap }); }
      for (const y of [start.y, o.y]) { spots.push({ x: o.x - o.w / 2 - gap - box.w / 2, y }, { x: o.x + o.w / 2 + gap + box.w / 2, y }); }
    }
    let best = start, fewest = clashes(start), nearest = 0;
    if (fewest) for (const raw of spots) {
      const spot = { ...box, x: clampX(box, raw.x), y: clampY(box, raw.y) }, n = clashes(spot), d = Math.hypot(spot.x - start.x, spot.y - start.y);
      if (n < fewest || (n === fewest && best !== start && d < nearest)) { best = spot; fewest = n; nearest = d; }
    }
    placed.push(best); result[index] = best;
  }
  return result;
}
