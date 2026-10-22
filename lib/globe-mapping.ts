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

/** The squares the nations' markers (and region seeds) stand on, in list order: a nation's capital (lib/nation-openings.ts) when it has one on the map; until then a stand-in.
 *  [ASSUMPTION] Stand-ins are placeholders, not lore: the docs give the six unopened nations no map coordinates (docs 6.1/6.2 reduced-scale map; the opening PR for a nation
 *  adds its capital, lib/nation-openings.ts). Each stand-in is the square outside every capital's block (`reserve`, the frontier radius) and farthest from every capital and every
 *  stand-in placed so far, and at least `minCommons` squares (Chebyshev) from the Commons centre, the same rule a real capital must meet (mapFitRules), so it never takes
 *  part of a nation's region or the Commons. */
export function nationGlobeSquares(capitals: readonly (Square | undefined)[], grid: Grid = WORLD_GRID, reserve = 3, commons?: { centre: Square; minCommons: number }): Square[] {
  // distance in squares, the smaller of grid (Chebyshev, columns wrap round the globe) and globe arc (in rows), so far apart both on the grid and on the sphere; capital blocks count from their edge
  const cheb = (a: Square, b: Square) => Math.max(Math.min(Math.abs(a.x - b.x), grid.width - Math.abs(a.x - b.x)), Math.abs(a.y - b.y));
  const placed: { square: Square; margin: number }[] = capitals.filter((c): c is Square => !!c).map(square => ({ square, margin: 0 }));
  const heartlands = capitals.flatMap(c => c ? Array.from({ length: (2 * reserve - 1) ** 2 }, (_, i) => ({ c, s: { x: c.x - reserve + 1 + (i % (2 * reserve - 1)), y: c.y - reserve + 1 + Math.floor(i / (2 * reserve - 1)) } })) : []);
  return capitals.map(capital => {
    if (capital) return capital;
    let best: Square = { x: 0, y: Math.floor(grid.height / 2) }, score = -1;
    for (let y = 2; y < grid.height - 2; y++) for (let x = 0; x < grid.width; x++) { // not the polar rows
      if (commons && Math.max(Math.abs(x - commons.centre.x), Math.abs(y - commons.centre.y)) < commons.minCommons) continue;
      const p = squareLatLon({ x, y }, grid), far = (q: Square) => Math.min(cheb({ x, y }, q), arc(p, squareLatLon(q, grid)) * grid.height / Math.PI);
      if (heartlands.some(({ s, c }) => cheb({ x, y }, c) <= reserve || arc(squareLatLon(s, grid), p) <= arc(squareLatLon(s, grid), squareLatLon(c, grid)))) continue; // outside every block; no Heartland square nearer to it than to its capital
      const d = placed.length ? Math.min(...placed.map(q => far(q.square) - q.margin)) : 0;
      if (d > score + 1e-9) { score = d; best = { x, y }; }
    }
    placed.push({ square: best, margin: 0 });
    return best;
  });
}

/** Each nation's marker position on the globe, in list order. */
export function nationGlobeCoordinates(capitals: readonly (Square | undefined)[], grid: Grid = WORLD_GRID, commons?: { centre: Square; minCommons: number }) {
  return nationGlobeSquares(capitals, grid, 3, commons).map(square => squareLatLon(square, grid));
}

/** Marker positions for `ids`, keyed to the nation catalog's order (not the order passed): catalog nations first, then any id outside it, sorted. */
export function nationPlaces(catalog: readonly { id: string; capital?: Square }[], ids: readonly string[], grid: Grid = WORLD_GRID, commons?: { centre: Square; minCommons: number }) {
  const list = [...catalog, ...[...new Set(ids)].filter(id => !catalog.some(n => n.id === id)).sort().map(id => ({ id, capital: undefined }))];
  const coordinates = nationGlobeCoordinates(list.map(n => n.capital), grid, commons);
  return ids.map(id => coordinates[list.findIndex(n => n.id === id)]);
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
