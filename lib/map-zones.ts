import type { GameDatabase } from './database-contract';

/**
 * World map zones PoC (#66, docs 6.1/6.2). A reduced-scale, deterministic
 * square grid for the three MVP nations. Read-only: no buying, founding,
 * capture or sea lanes.
 */
export type Zone = 'heartland' | 'frontier' | 'wildlands' | 'commons';
export type WorldSquare = { x: number; y: number; zone: Zone; owner: string | null; terrain: string; resource: string | null; feature: string | null };

export const mapWidth = 24;
export const mapHeight = 18;
export const zoneOrder: readonly Zone[] = ['heartland', 'frontier', 'wildlands', 'commons'];
export const zoneLabels: Record<Zone, string> = { heartland: 'Heartland', frontier: 'Frontier', wildlands: 'Wildlands', commons: 'The Commons' };
export const acquisitionRules: Record<Zone, string> = {
  heartland: 'Never capturable',
  frontier: 'Purchasable when unclaimed; transferable by treaty; capturable in war',
  wildlands: 'Purchasable when unclaimed from the World Registry, or claimed by founding a city',
  commons: 'Cannot be bought. Claimed only by war or treaty (or a joint-development agreement)',
};

/** Capitals and their outward direction toward the Commons for the border outpost. */
export const mvpNations = [
  { id: 'kindle', capital: { x: 5, y: 4 }, outpost: { x: 8, y: 7 }, biome: ['plains', 'hills', 'volcanic badland'] },
  { id: 'korund', capital: { x: 18, y: 4 }, outpost: { x: 15, y: 7 }, biome: ['mountains', 'cliff/plateau', 'hills'] },
  { id: 'aurelle', capital: { x: 12, y: 14 }, outpost: { x: 12, y: 11 }, biome: ['cliff/plateau', 'plains', 'coast'] },
] as const;
const commonsCentre = { x: 12, y: 6 };
const heartlandRadius = 2, frontierRadius = 3;
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

export function seedWorldSquares(): WorldSquare[] {
  const squares: WorldSquare[] = [];
  for (let y = 0; y < mapHeight; y++) for (let x = 0; x < mapWidth; x++) {
    const h = hash(x, y), p = { x, y };
    const nation = mvpNations.find(n => cheb(p, n.capital) <= frontierRadius);
    if (nation) {
      const d = cheb(p, nation.capital);
      const heart = d <= heartlandRadius;
      const isCapital = d === 0, isOutpost = x === nation.outpost.x && y === nation.outpost.y;
      squares.push({ x, y, zone: heart ? 'heartland' : 'frontier', owner: heart || isOutpost ? nation.id : null,
        terrain: isCapital || isOutpost ? 'city' : nation.biome[h % nation.biome.length],
        resource: isCapital || isOutpost || h % 5 ? null : ordinaryResources[h % ordinaryResources.length],
        feature: isCapital ? 'capital' : isOutpost ? 'border outpost' : null });
      continue;
    }
    if (cheb(p, commonsCentre) <= 1) {
      squares.push({ x, y, zone: 'commons', owner: null, terrain: wildTerrain[h % wildTerrain.length],
        resource: h % 3 ? rareResources[h % rareResources.length] : null, feature: x === commonsCentre.x && y === commonsCentre.y ? 'wonder site' : null });
      continue;
    }
    squares.push({ x, y, zone: 'wildlands', owner: null, terrain: wildTerrain[h % wildTerrain.length],
      resource: h % 4 ? null : ordinaryResources[h % ordinaryResources.length], feature: null });
  }
  return squares;
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
    if (rows.length) return { squares: rows.map(r => ({ x: Number(r.x), y: Number(r.y), zone: r.zone, owner: r.owner, terrain: r.terrain, resource: r.resource, feature: r.feature })), source: 'table' };
  } catch { /* table not migrated yet on this backend: serve the identical deterministic seed */ }
  return { squares: seedWorldSquares(), source: 'seed' };
}
