/** #486 (ARC): a nation's opening may overwrite untouched Wildlands, but it must refuse if any square of its 7x7 block is a player's: purchased (world_square_purchases),
 *  captured (city_capture_squares) or claimed by a founded city (world_cities, radius `claimRadius`). The refusal is logged, naming the nation and the squares, so the capital can be moved.
 *  Every opening PR seeds the nation's squares through `openNationSquares`, never `nationSquaresUpsertSql` directly. Fails closed: a read that errors refuses the opening. */
import type { GameDatabase } from './database-contract';
import { mappedNations, nationSquaresUpsertSql, frontierRadius, type MapNation } from './map-zones';
import { claimRadius } from './city-founding';

export type OpeningBlocker = { x: number; y: number; reason: 'purchased' | 'captured' | 'city claim' };
type XY = { x: number | string; y: number | string };

export async function nationOpeningBlockers(db: GameDatabase, nationId: string, nations: readonly MapNation[] = mappedNations): Promise<OpeningBlocker[]> {
  const nation = nations.find(n => n.id === nationId);
  if (!nation) return [];
  const { x, y } = nation.capital, r = frontierRadius, box = [x - r, x + r, y - r, y + r];
  const rows = async (sql: string, bind: number[]) => (await db.prepare(sql).bind(...bind).all<XY>()).results ?? [];
  const out: OpeningBlocker[] = [];
  for (const s of await rows('SELECT x,y FROM world_square_purchases WHERE x BETWEEN ? AND ? AND y BETWEEN ? AND ?', box)) out.push({ x: Number(s.x), y: Number(s.y), reason: 'purchased' });
  for (const s of await rows('SELECT DISTINCT x,y FROM city_capture_squares WHERE x BETWEEN ? AND ? AND y BETWEEN ? AND ?', box)) out.push({ x: Number(s.x), y: Number(s.y), reason: 'captured' });
  const c = claimRadius; // a city claims the square block of radius claimRadius around its centre
  for (const city of await rows('SELECT center_x AS x, center_y AS y FROM world_cities WHERE center_x BETWEEN ? AND ? AND center_y BETWEEN ? AND ?', [x - r - c, x + r + c, y - r - c, y + r + c]))
    for (let sy = Number(city.y) - c; sy <= Number(city.y) + c; sy++) for (let sx = Number(city.x) - c; sx <= Number(city.x) + c; sx++)
      if (Math.abs(sx - x) <= r && Math.abs(sy - y) <= r) out.push({ x: sx, y: sy, reason: 'city claim' });
  return out.sort((a, b) => a.y - b.y || a.x - b.x || a.reason.localeCompare(b.reason));
}

/** Seeds one nation's block, or refuses (and logs) when a player holds any square in it. */
export async function openNationSquares(db: GameDatabase, nationId: string, nations: readonly MapNation[] = mappedNations, log: (message: string) => void = console.warn):
  Promise<{ ok: true } | { ok: false; reason: 'unmapped' | 'unreadable' | 'player squares'; blockers: OpeningBlocker[] }> {
  if (!nations.some(n => n.id === nationId)) { // #486 (QA1): an unmapped nation has no block; never report success for an empty batch
    log(`[#486] opening of ${nationId} refused: it is not a mapped nation (no capital), so there is no block to open.`); return { ok: false, reason: 'unmapped', blockers: [] };
  }
  let blockers: OpeningBlocker[];
  try { blockers = await nationOpeningBlockers(db, nationId, nations); }
  catch { log(`[#486] opening of ${nationId} refused: could not read player squares in its block (fail closed).`); return { ok: false, reason: 'unreadable', blockers: [] }; }
  if (blockers.length) {
    log(`[#486] opening of ${nationId} refused: player squares in its block ${blockers.map(b => `(${b.x},${b.y}) ${b.reason}`).join(', ')}. Move the capital.`);
    return { ok: false, reason: 'player squares', blockers };
  }
  await db.batch(nationSquaresUpsertSql(nationId, nations).map(sql => db.prepare(sql)));
  return { ok: true };
}
