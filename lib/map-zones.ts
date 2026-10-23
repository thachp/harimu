import type { GameDatabase } from './database-contract';
import type { Zone } from './map-zone-labels';
import { nationOpenings } from './nation-openings';
import { WORLD_GRID } from './globe-mapping';

/**
 * World map zones PoC (#66, docs 6.1/6.2). A reduced-scale, deterministic
 * square grid for the three MVP nations. Read-only: no buying, founding,
 * capture or sea lanes.
 */
export type WorldSquare = { x: number; y: number; zone: Zone; owner: string | null; terrain: string; resource: string | null; feature: string | null };

export const mapWidth = WORLD_GRID.width; // the grid size lives in lib/globe-mapping.ts
export const mapHeight = WORLD_GRID.height;
export { zoneOrder, zoneLabels, acquisitionRules } from './map-zone-labels';
export type { Zone } from './map-zone-labels';

type Point = { x: number; y: number };
export type MapNation = { id: string; capital: Point; outpost?: Point; biome: readonly string[] };
/** Capitals, border outposts and biomes of the nations on the map (#491): derived from the registry (`lib/nation-openings.ts`), the nations that have a capital there.
 *  Today that is exactly the three live nations, in the same order and with the same values as the old literal. */
export const mappedNations: readonly MapNation[] = nationOpenings.flatMap(o => o.capital && o.biome?.length ? [{ id: o.id, capital: o.capital, outpost: o.outpost, biome: o.biome }] : []);
/** #487: the live nations on the map (travel, missionaries, sieges, city founding and the original seed keep using these). A flag-gated nation's squares are on the map
 *  (`mappedNations`, added by `nationSquaresUpsertSql`), but it is not reachable by travel or missionaries until it opens for the public. */
export const mvpNations: readonly MapNation[] = mappedNations.filter(n => nationOpenings.find(o => o.id === n.id)?.openingFlag === null);
/** The nations whose squares the original seed (migration 0011 / `worldSquaresSeedSql`) already wrote; any other nation with a capital is added by `nationSquaresUpsertSql`. */
export const originallySeededNations: readonly string[] = ['kindle', 'korund', 'aurelle'];
export const commonsCentre = { x: 12, y: 6 }; // #486: exported so lib/nation-openings.ts mapFitRules is pinned to it
export const heartlandRadius = 2, frontierRadius = 3;
const wildTerrain = ['plains', 'forest', 'hills', 'wetland', 'river edge', 'old-growth forest'];
const ordinaryResources = ['food', 'timber', 'stone', 'ore', 'fuel', 'cloth fiber'];
const rareResources = ['Emberstone', 'Riverpearl', 'Ironroot', 'Skysilk', 'Sunglass'];

/** Small integer hash so terrain/resources are stable across runs and runtimes. */
function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

function squareAt(x: number, y: number, nations: readonly MapNation[]): WorldSquare {
  const h = hash(x, y), p = { x, y };
  const nation = nations.find(n => cheb(p, n.capital) <= frontierRadius);
  if (nation) {
    const d = cheb(p, nation.capital);
    const heart = d <= heartlandRadius;
    const isCapital = d === 0, isOutpost = Boolean(nation.outpost) && x === nation.outpost!.x && y === nation.outpost!.y;
    return { x, y, zone: heart ? 'heartland' : 'frontier', owner: heart || isOutpost ? nation.id : null,
      terrain: isCapital || isOutpost ? 'city' : nation.biome[h % nation.biome.length],
      resource: isCapital || isOutpost || h % 5 ? null : ordinaryResources[h % ordinaryResources.length],
      feature: isCapital ? 'capital' : isOutpost ? 'border outpost' : null };
  }
  if (cheb(p, commonsCentre) <= 1) {
    return { x, y, zone: 'commons', owner: null, terrain: wildTerrain[h % wildTerrain.length],
      resource: h % 3 ? rareResources[h % rareResources.length] : null, feature: x === commonsCentre.x && y === commonsCentre.y ? 'wonder site' : null };
  }
  return { x, y, zone: 'wildlands', owner: null, terrain: wildTerrain[h % wildTerrain.length],
    resource: h % 4 ? null : ordinaryResources[h % ordinaryResources.length], feature: null };
}

type GridSize = { width: number; height: number };
/** `grid` defaults to WORLD_GRID; #486: the committed migration 0011 is regenerated at the original 24x18 (`gridGrowth486.from`). */
export function seedWorldSquares(nations: readonly MapNation[] = mvpNations, grid: GridSize = WORLD_GRID): WorldSquare[] {
  const squares: WorldSquare[] = [];
  for (let y = 0; y < grid.height; y++) for (let x = 0; x < grid.width; x++) squares.push(squareAt(x, y, nations));
  return squares;
}

/** One nation's Heartland + Frontier squares exactly as `seedWorldSquares(nations)` would write them (a square two nations' blocks share belongs to the first in `nations`). */
export function nationBlockSquares(nationId: string, nations: readonly MapNation[] = mappedNations): WorldSquare[] {
  const nation = nations.find(n => n.id === nationId);
  if (!nation) return [];
  const out: WorldSquare[] = [];
  for (let y = Math.max(0, nation.capital.y - frontierRadius); y <= Math.min(mapHeight - 1, nation.capital.y + frontierRadius); y++)
    for (let x = Math.max(0, nation.capital.x - frontierRadius); x <= Math.min(mapWidth - 1, nation.capital.x + frontierRadius); x++)
      if (nations.find(n => cheb({ x, y }, n.capital) <= frontierRadius)?.id === nationId) out.push(squareAt(x, y, nations));
  return out;
}
/** Squares of a nation's block that are not plain untouched Wildlands in `existing` (another nation's block, the Commons, a purchased or founded square, off-grid). The PR that gives a nation a capital
 *  must choose one with no conflicts: the upsert below refuses to overwrite any of them, so such a capital would seed a partial block. */
export function nationBlockConflicts(nationId: string, nations: readonly MapNation[], existing: readonly WorldSquare[]): { x: number; y: number }[] {
  const nation = nations.find(n => n.id === nationId);
  if (!nation) return [];
  const at = new Map(existing.map(s => [`${s.x},${s.y}`, s]));
  const bad: { x: number; y: number }[] = [];
  for (let y = nation.capital.y - frontierRadius; y <= nation.capital.y + frontierRadius; y++)
    for (let x = nation.capital.x - frontierRadius; x <= nation.capital.x + frontierRadius; x++) {
      const e = at.get(`${x},${y}`);
      const taken = nations.find(n => cheb({ x, y }, n.capital) <= frontierRadius)?.id !== nationId; // off the grid is never taken, but also never present
      if (!e || taken || e.zone !== 'wildlands' || e.owner !== null || e.feature !== null) bad.push({ x, y });
    }
  return bad;
}

export const worldSquaresSchema = `CREATE TABLE IF NOT EXISTS world_squares (
 x INTEGER NOT NULL, y INTEGER NOT NULL,
 zone TEXT NOT NULL CHECK(zone IN ('heartland','frontier','wildlands','commons')),
 owner TEXT, terrain TEXT NOT NULL, resource TEXT, feature TEXT,
 PRIMARY KEY (x, y)
)`;
const lit = (v: string | number | null) => v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${v.replace(/'/g, "''")}'`;
/** Idempotent seed statements (literal values from the fixed seed only; no user input). */
export function worldSquaresSeedSql(chunk = 100, conflict: 'sqlite' | 'postgres' = 'sqlite', grid: GridSize = WORLD_GRID): string[] {
  const rows = seedWorldSquares(mvpNations, grid).map(s => `(${[s.x, s.y, s.zone, s.owner, s.terrain, s.resource, s.feature].map(lit).join(',')})`);
  const out: string[] = [];
  for (let i = 0; i < rows.length; i += chunk) {
    const values = rows.slice(i, i + chunk).join(',');
    out.push(conflict === 'sqlite'
      ? `INSERT OR IGNORE INTO world_squares (x,y,zone,owner,terrain,resource,feature) VALUES ${values}`
      : `INSERT INTO world_squares (x,y,zone,owner,terrain,resource,feature) VALUES ${values} ON CONFLICT (x,y) DO NOTHING`);
  }
  return out;
}
/** Idempotent upsert that adds only one nation's squares to an already-seeded `world_squares` (#491), keyed by (x,y). It overwrites a square only while it is still untouched Wildlands (no owner, no feature),
 *  so the three live nations, the Commons and any purchased or founded square are never changed, and a second run changes nothing. The same statement runs on SQLite (3.24+, D1) and Postgres. Literal values from the fixed seed only. */
export function nationSquaresUpsertSql(nationId: string, nations: readonly MapNation[] = mappedNations, chunk = 100): string[] {
  const rows = nationBlockSquares(nationId, nations).map(s => `(${[s.x, s.y, s.zone, s.owner, s.terrain, s.resource, s.feature].map(lit).join(',')})`);
  const out: string[] = [];
  for (let i = 0; i < rows.length; i += chunk)
    out.push(`INSERT INTO world_squares (x,y,zone,owner,terrain,resource,feature) VALUES ${rows.slice(i, i + chunk).join(',')} ON CONFLICT (x,y) DO UPDATE SET zone=excluded.zone, owner=excluded.owner, terrain=excluded.terrain, resource=excluded.resource, feature=excluded.feature `
      + `WHERE world_squares.zone='wildlands' AND world_squares.owner IS NULL AND world_squares.feature IS NULL`);
  return out;
}
/** #486 (ARC on #486: 30x24 additive): the one growth of the world grid, from the old size to the new. Kept as literals, not WORLD_GRID, so migration 0066 stays reproducible after the switch. */
export const gridGrowth486 = { from: { width: 24, height: 18 }, to: { width: 30, height: 24 } } as const;
/** Insert-only statements for the squares a grid growth adds (x >= from.width or y >= from.height), seeded exactly as `seedWorldSquares` would seed them on the larger grid.
 *  `ON CONFLICT (x,y) DO NOTHING` on both SQLite and Postgres: an existing row is never updated or deleted, and a second run changes nothing. Literal values from the fixed seed only. */
export function gridGrowthSql(growth: { from: { width: number; height: number }; to: { width: number; height: number } } = gridGrowth486, nations: readonly MapNation[] = mappedNations, chunk = 100): string[] {
  const rows: string[] = [];
  for (let y = 0; y < growth.to.height; y++) for (let x = 0; x < growth.to.width; x++) if (x >= growth.from.width || y >= growth.from.height) {
    const s = squareAt(x, y, nations); rows.push(`(${[s.x, s.y, s.zone, s.owner, s.terrain, s.resource, s.feature].map(lit).join(',')})`);
  }
  const out: string[] = [];
  for (let i = 0; i < rows.length; i += chunk) out.push(`INSERT INTO world_squares (x,y,zone,owner,terrain,resource,feature) VALUES ${rows.slice(i, i + chunk).join(',')} ON CONFLICT (x,y) DO NOTHING`);
  return out;
}
/** Boot step (lib/db.ts, SQLite/D1): the upsert for every mapped nation the original seed did not write. #487: today that is Confluence's block. A Postgres
 *  database has no boot DDL path: the PR that gives the first new nation its capital runs `nationSquaresUpsertSql(id)` as its (additive) migration. */
export function bootNationSquaresSql(nations: readonly MapNation[] = mappedNations): string[] {
  return nations.filter(n => !originallySeededNations.includes(n.id)).flatMap(n => nationSquaresUpsertSql(n.id, nations));
}

export function postgresWorldSquaresMigration(): string {
  return ['-- Generated by lib/map-zones.ts (#66). Read-only world squares PoC; additive.',
    worldSquaresSchema.replace(/TEXT/g, 'TEXT COLLATE "C"') + ';',
    ...worldSquaresSeedSql(200, 'postgres', gridGrowth486.from).map(s => s + ';'), ''].join('\n');
}

export function sqliteWorldSquaresMigration(): string {
  return ['-- Generated by lib/map-zones.ts (#66). Additive, idempotent read-only world squares.',
    worldSquaresSchema + ';', ...worldSquaresSeedSql(100, 'sqlite', gridGrowth486.from).map(s => s + ';'), ''].join('\n');
}

/** #486 (30x24 additive grid, slice 1): the rows of `world_squares` that lie on this build's grid. A table may hold more rows than the grid (the additive migration that grows
 *  the map runs before the build that reads the larger grid), so readers count and use only on-grid rows; a table missing any on-grid row is still incomplete. */
// QA1 on #724: a non-integer coordinate is never on the grid. Travel and sieges read single squares and keep their own bounds checks (lib/travel.ts, lib/siege-actions.ts),
// so they never see rows beyond the grid either.
export const onGrid = <T extends { x: number | string; y: number | string }>(rows: readonly T[]): T[] => rows.filter(r => {
  const x = Number(r.x), y = Number(r.y);
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < mapWidth && y < mapHeight;
});
type Row = { x: number; y: number; zone: Zone; owner: string | null; terrain: string; resource: string | null; feature: string | null };
/** #745: every map-design §6.2 rare node type lands on at least one square. The 0011 seed (above, pinned to its migration) only produces Emberstone, Riverpearl and Skysilk.
 *  [ASSUMPTION] Placements: the docs give no coordinates. Three go on the Commons squares the seed left empty (§6.1: "a central region of rare resource nodes"); the Commons
 *  has 9 squares, so the other four go on empty, unowned Wildlands squares touching it, which 0067 rezones to Commons (QA1 on #751: rare nodes cannot be bought). `zone` is the square's zone before. No existing node is replaced. */
export const rareNodePlacements: readonly { x: number; y: number; zone: Zone; resource: string }[] = [
  { x: 12, y: 5, zone: 'commons', resource: 'Ironroot' }, { x: 13, y: 6, zone: 'commons', resource: 'Sunglass' }, { x: 12, y: 7, zone: 'commons', resource: 'Geotherm core' },
  { x: 12, y: 4, zone: 'wildlands', resource: 'Frostcore' }, { x: 10, y: 6, zone: 'wildlands', resource: 'Hazequartz' }, { x: 14, y: 7, zone: 'wildlands', resource: 'Heartwood' }, { x: 12, y: 8, zone: 'wildlands', resource: 'Stormcells' },
];
/** ARC on #751: if a target square is owned, resourced or holds a city, the type goes to the nearest eligible square instead. Eligible: unowned, no resource, no feature,
 *  inside `rareNodeWindow`, outside every capital's 7x7 block. QA1 on #751 (§6.1): every node square ends up 'commons' (rezoned in the same guarded update, unowned only).
 *  Order, fixed: the target itself, then squares already Commons, then the rest; then Chebyshev distance, then squared distance, then y, then x. A type already on the map is skipped (idempotent). */
export const rareNodeWindow = { x0: 10, x1: 14, y0: 4, y1: 8 } as const;
/** [ASSUMPTION] All 10 capitals on the 30x24 grid (the four live ones plus #728's six), so a node never lands in a block a capital will open. */
export const rareNodeCapitals: readonly { x: number; y: number }[] = [
  { x: 5, y: 4 }, { x: 4, y: 13 }, { x: 18, y: 4 }, { x: 12, y: 14 }, { x: 26, y: 17 }, { x: 25, y: 3 }, { x: 3, y: 20 }, { x: 19, y: 11 }, { x: 26, y: 10 }, { x: 19, y: 18 },
];
const rareEligibleSql = `zone IN ('commons','wildlands') AND owner IS NULL AND resource IS NULL AND feature IS NULL AND x BETWEEN ${rareNodeWindow.x0} AND ${rareNodeWindow.x1} AND y BETWEEN ${rareNodeWindow.y0} AND ${rareNodeWindow.y1}`
  + rareNodeCapitals.map(c => ` AND NOT (x BETWEEN ${c.x - 3} AND ${c.x + 3} AND y BETWEEN ${c.y - 3} AND ${c.y + 3})`).join('');
const chebSql = (p: { x: number; y: number }) => `CASE WHEN abs(x-${p.x})>abs(y-${p.y}) THEN abs(x-${p.x}) ELSE abs(y-${p.y}) END`;
/** Same SQL for SQLite and Postgres (abs and CASE only; row values in the WHERE). */
export const rareNodesSql = (): string[] => rareNodePlacements.map(p => `UPDATE world_squares SET resource=${lit(p.resource)}, zone='commons' WHERE NOT EXISTS (SELECT 1 FROM world_squares WHERE resource=${lit(p.resource)}) `
  + `AND (x,y) = (SELECT x,y FROM world_squares WHERE ${rareEligibleSql} ORDER BY CASE WHEN x=${p.x} AND y=${p.y} THEN 0 WHEN zone='commons' THEN 1 ELSE 2 END, ${chebSql(p)}, (x-${p.x})*(x-${p.x})+(y-${p.y})*(y-${p.y}), y, x LIMIT 1)`);
/** Post-seed check: unless all seven types exist on 'commons' squares (§6.1: rare nodes sit in the Commons and cannot be bought), insert a row with NULL x (NOT NULL), so the migration fails on both backends. DML only. */
export const rareNodesCheckSql = (): string => `INSERT INTO world_squares (x,y,zone,owner,terrain,resource,feature) SELECT NULL,NULL,'wildlands',NULL,'rare node check failed',NULL,NULL `
  + `WHERE (SELECT COUNT(DISTINCT resource) FROM world_squares WHERE zone='commons' AND resource IN (${rareNodePlacements.map(p => lit(p.resource)).join(',')})) < ${rareNodePlacements.length}`;
export const rareNodesMigration = (): string => ['-- Generated by lib/map-zones.ts (#745, ARC on #751). Seeds the seven missing map-design 6.2 rare node types; an occupied target falls back to the nearest eligible square; fails unless all seven exist.',
  '-- Eligible: Commons, or an unowned Wildlands square that the same UPDATE rezones to Commons; never Heartland or Frontier.',
  ...rareNodesSql().map(s => s + ';'),
  '-- Post-seed check: unless all seven types sit on Commons squares, this inserts a row with x NULL. world_squares.x is NOT NULL, so the insert fails and so does the migration (SQLite and Postgres; DML only, no RAISE needed).',
  rareNodesCheckSql() + ';', ''].join('\n');
/** The in-code seed with the same placements and fallback (used when the table is not complete). */
export function withRareNodes(squares: WorldSquare[]): WorldSquare[] {
  const out = squares.map(s => ({ ...s })), w = rareNodeWindow;
  const ok = (s: WorldSquare) => (s.zone === 'commons' || s.zone === 'wildlands') && !s.owner && !s.resource && !s.feature && s.x >= w.x0 && s.x <= w.x1 && s.y >= w.y0 && s.y <= w.y1 && rareNodeCapitals.every(c => Math.max(Math.abs(c.x - s.x), Math.abs(c.y - s.y)) > 3);
  for (const p of rareNodePlacements) {
    if (out.some(s => s.resource === p.resource)) continue;
    const key = (s: WorldSquare) => [s.x === p.x && s.y === p.y ? 0 : s.zone === 'commons' ? 1 : 2, Math.max(Math.abs(s.x - p.x), Math.abs(s.y - p.y)), (s.x - p.x) ** 2 + (s.y - p.y) ** 2, s.y, s.x];
    const best = out.filter(ok).sort((a, b) => { const ka = key(a), kb = key(b), i = ka.findIndex((v, j) => v !== kb[j]); return i < 0 ? 0 : ka[i] - kb[i]; })[0];
    if (best) { best.resource = p.resource; best.zone = 'commons'; }
  }
  return out;
}
export async function readWorldSquares(db: GameDatabase): Promise<{ squares: WorldSquare[]; source: 'table' | 'seed' }> {
  try {
    const result = await db.prepare('SELECT x,y,zone,owner,terrain,resource,feature FROM world_squares ORDER BY y,x').all<Row>();
    const rows = onGrid(result.results ?? []); // #486: ignore rows beyond this build's grid
    // Only a complete grid counts; a partially applied seed falls back to the identical in-code seed.
    if (rows.length === mapWidth * mapHeight) return { squares: rows.map(r => ({ x: Number(r.x), y: Number(r.y), zone: r.zone, owner: r.owner, terrain: r.terrain, resource: r.resource, feature: r.feature })), source: 'table' };
  } catch { /* table not migrated yet on this backend: serve the identical deterministic seed */ }
  return { squares: withRareNodes(seedWorldSquares()), source: 'seed' };
}
