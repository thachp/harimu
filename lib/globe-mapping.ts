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
