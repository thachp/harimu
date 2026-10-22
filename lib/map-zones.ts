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

export function seedWorldSquares(nations: readonly MapNation[] = mvpNations): WorldSquare[] {
  const squares: WorldSquare[] = [];
  for (let y = 0; y < mapHeight; y++) for (let x = 0; x < mapWidth; x++) squares.push(squareAt(x, y, nations));
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
export function worldSquaresSeedSql(chunk = 100, conflict: 'sqlite' | 'postgres' = 'sqlite'): string[] {
  const rows = seedWorldSquares().map(s => `(${[s.x, s.y, s.zone, s.owner, s.terrain, s.resource, s.feature].map(lit).join(',')})`);
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
/** Boot step (lib/db.ts, SQLite/D1): the upsert for every mapped nation the original seed did not write. #487: today that is Confluence's block. A Postgres
 *  database has no boot DDL path: the PR that gives the first new nation its capital runs `nationSquaresUpsertSql(id)` as its (additive) migration. */
export function bootNationSquaresSql(nations: readonly MapNation[] = mappedNations): string[] {
  return nations.filter(n => !originallySeededNations.includes(n.id)).flatMap(n => nationSquaresUpsertSql(n.id, nations));
}

export function postgresWorldSquaresMigration(): string {
  return ['-- Generated by lib/map-zones.ts (#66). Read-only world squares PoC; additive.',
    worldSquaresSchema.replace(/TEXT/g, 'TEXT COLLATE "C"') + ';',
    ...worldSquaresSeedSql(200, 'postgres').map(s => s + ';'), ''].join('\n');
}

export function sqliteWorldSquaresMigration(): string {
  return ['-- Generated by lib/map-zones.ts (#66). Additive, idempotent read-only world squares.',
    worldSquaresSchema + ';', ...worldSquaresSeedSql().map(s => s + ';'), ''].join('\n');
}

type Row = { x: number; y: number; zone: Zone; owner: string | null; terrain: string; resource: string | null; feature: string | null };
export async function readWorldSquares(db: GameDatabase): Promise<{ squares: WorldSquare[]; source: 'table' | 'seed' }> {
  try {
    const result = await db.prepare('SELECT x,y,zone,owner,terrain,resource,feature FROM world_squares ORDER BY y,x').all<Row>();
    const rows = result.results ?? [];
    // Only a complete grid counts; a partially applied seed falls back to the identical in-code seed.
    if (rows.length === mapWidth * mapHeight) return { squares: rows.map(r => ({ x: Number(r.x), y: Number(r.y), zone: r.zone, owner: r.owner, terrain: r.terrain, resource: r.resource, feature: r.feature })), source: 'table' };
  } catch { /* table not migrated yet on this backend: serve the identical deterministic seed */ }
  return { squares: seedWorldSquares(), source: 'seed' };
}
