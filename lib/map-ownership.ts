/** #82 slice 2: the Ownership overlay. Pure helper for the read-only GET /api/world/ownership. */

export type OwnershipMap = { width: number; height: number; cells: [number, number, string][]; totals: { nationId: string; squares: number }[] };

/** Only owned squares, as [x, y, nation]; totals sorted by squares, then nation id. */
export function ownershipMap(width: number, height: number, squares: readonly { x: number; y: number; owner: string | null }[]): OwnershipMap {
  const cells: [number, number, string][] = [], counts = new Map<string, number>();
  for (const { x, y, owner } of squares) if (owner) { cells.push([x, y, owner]); counts.set(owner, (counts.get(owner) ?? 0) + 1); }
  const totals = [...counts].map(([nationId, n]) => ({ nationId, squares: n })).sort((a, b) => b.squares - a.squares || a.nationId.localeCompare(b.nationId));
  return { width, height, cells, totals };
}

/** QA3 anchoring rule: square (x, y) of a width×height world sits on the globe equirectangularly (column → longitude, row → latitude),
 *  at the globe's own radius, so it turns with the globe. Front hemisphere only (same limb cut as the nation labels). */
export function ownershipCellLatLon(x: number, y: number, width: number, height: number) {
  return { latitude: 90 - (y + .5) * 180 / height, longitude: -180 + (x + .5) * 360 / width };
}
type Vec = { x: number; y: number; z: number; set(x: number, y: number, z: number): Vec; applyMatrix4(m: unknown): Vec; project(camera: unknown): Vec };
/** Screen spots for each owned cell under the current globe rotation and camera; called by GameViewport on every frame it draws. */
export function projectOwnershipCells(map: Pick<OwnershipMap, 'width' | 'height'>, cells: readonly [number, number][], globe: { matrixWorld: unknown }, camera: unknown, size: { w: number; h: number }, vec: Vec) {
  return cells.map(([x, y]) => {
    const { latitude, longitude } = ownershipCellLatLon(x, y, map.width, map.height), lat = latitude * Math.PI / 180, lon = longitude * Math.PI / 180;
    const p = vec.set(7.05 * Math.cos(lat) * Math.sin(lon), 7.05 * Math.sin(lat), 7.05 * Math.cos(lat) * Math.cos(lon)).applyMatrix4(globe.matrixWorld);
    const front = p.z / Math.hypot(p.x, p.y, p.z) > .16;
    p.project(camera);
    return { left: (p.x + 1) * size.w / 2, top: (1 - p.y) * size.h / 2, hidden: !front || Math.abs(p.x) > 1 || Math.abs(p.y) > 1 };
  });
}
