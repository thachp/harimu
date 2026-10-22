/** #82 (ARC on #720): the one square-to-globe mapping. Import-free so plain-Node tests and the client both load it.
 *  Nation markers and regions (lib/game-art.ts, via GameViewport) and the Ownership overlay all place squares through squareLatLon. */

/** The world grid size: the single definition (lib/map-zones.ts mapWidth/mapHeight read it). Patrick has not chosen between 24x18 and 128x128 yet; change it here only. */
export const WORLD_GRID = { width: 24, height: 18 } as const;
export type Grid = { width: number; height: number };
export type Square = { x: number; y: number };

/** Equirectangular: column x → longitude (-180..180, west to east), row y → latitude (90..-90, north to south), at the square's centre. */
export function squareLatLon({ x, y }: Square, grid: Grid = WORLD_GRID): { latitude: number; longitude: number } {
  return { latitude: 90 - (y + .5) * 180 / grid.height, longitude: -180 + (x + .5) * 360 / grid.width };
}

const arc = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => {
  const r = Math.PI / 180;
  return Math.acos(Math.min(1, Math.sin(a.latitude * r) * Math.sin(b.latitude * r) + Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.cos((a.longitude - b.longitude) * r)));
};

/** The squares the nations' markers (and region seeds) stand on, in list order: a nation's capital (lib/nation-openings.ts) when it has one on the map;
 *  until then a stand-in, the square farthest from every capital's block (`reserve` squares around it, the frontier radius) and every stand-in placed so far, so it never takes part of a nation's region. */
export function nationGlobeSquares(capitals: readonly (Square | undefined)[], grid: Grid = WORLD_GRID, reserve = 3): Square[] {
  const placed = capitals.filter((c): c is Square => !!c).flatMap(c => Array.from({ length: (2 * reserve + 1) ** 2 }, (_, i) => squareLatLon({ x: c.x - reserve + (i % (2 * reserve + 1)), y: Math.max(0, Math.min(grid.height - 1, c.y - reserve + Math.floor(i / (2 * reserve + 1)))) }, grid)));
  return capitals.map(capital => {
    if (capital) return capital;
    let best: Square = { x: 0, y: Math.floor(grid.height / 2) }, score = -1;
    for (let y = 1; y < grid.height - 1; y++) for (let x = 0; x < grid.width; x++) { // not the polar rows
      const p = squareLatLon({ x, y }, grid), d = placed.length ? Math.min(...placed.map(q => arc(p, q))) : 0;
      if (d > score + 1e-9) { score = d; best = { x, y }; }
    }
    placed.push(squareLatLon(best, grid));
    return best;
  });
}

/** Each nation's marker position on the globe, in list order. */
export function nationGlobeCoordinates(capitals: readonly (Square | undefined)[], grid: Grid = WORLD_GRID) {
  return nationGlobeSquares(capitals, grid).map(square => squareLatLon(square, grid));
}

/** #82 Ownership overlay: squares through the same mapping, then the globe's rotation and the camera. */
type Vec = { x: number; y: number; z: number; set(x: number, y: number, z: number): Vec; applyMatrix4(m: unknown): Vec; project(camera: unknown): Vec };
/** Screen spots for each owned cell under the current globe rotation and camera; called by GameViewport on every frame it draws. */
export function projectOwnershipCells(map: Grid, cells: readonly [number, number][], globe: { matrixWorld: unknown }, camera: unknown, size: { w: number; h: number }, vec: Vec) {
  return cells.map(([x, y]) => {
    const { latitude, longitude } = squareLatLon({ x, y }, map), lat = latitude * Math.PI / 180, lon = longitude * Math.PI / 180;
    const p = vec.set(7.05 * Math.cos(lat) * Math.sin(lon), 7.05 * Math.sin(lat), 7.05 * Math.cos(lat) * Math.cos(lon)).applyMatrix4(globe.matrixWorld);
    const front = p.z / Math.hypot(p.x, p.y, p.z) > .16;
    p.project(camera);
    return { left: (p.x + 1) * size.w / 2, top: (1 - p.y) * size.h / 2, hidden: !front || Math.abs(p.x) > 1 || Math.abs(p.y) > 1 };
  });
}
