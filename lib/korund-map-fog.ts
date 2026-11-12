/** #1381 docs §11.5: a signed-in Korund viewer sees Korund squares and their 8-neighbours.
 *  The neighbour test is the same as checkPurchaseSite and bordersAttacker: max(|dx|,|dy|) === 1.
 *  Flag off, a signed-out request, or any other nation returns the squares unchanged. */
import { authenticatedUserId } from './auth';
import type { GameDatabase } from './database-contract';
import { flagOn } from './flag-pack.mjs';

export const korundMapFogFlag = 'HARIMU_KORUND_MAP_FOG_ENABLED';
type Square = { x: number; y: number; owner: string | null };

export function korundFogSquares<T extends Square>(squares: readonly T[]): T[] {
  const owned = new Set<string>();
  for (const square of squares) if (square.owner === 'korund') owned.add(`${square.x},${square.y}`);
  return squares.filter(square => {
    if (owned.has(`${square.x},${square.y}`)) return true;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && owned.has(`${square.x + dx},${square.y + dy}`)) return true;
    return false;
  });
}

/** `fog` is true only when the payload was reduced. Callers then send `Cache-Control: private, no-store`. */
export async function foggedSquares<T extends Square>(request: Request, squares: readonly T[], env: unknown, db: GameDatabase): Promise<{ squares: readonly T[]; fog: boolean }> {
  if (!flagOn(env, korundMapFogFlag)) return { squares, fog: false };
  const userId = await authenticatedUserId(request);
  if (!userId) return { squares, fog: false };
  const row = await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string | null }>();
  if (row?.nation_id !== 'korund') return { squares, fog: false };
  return { squares: korundFogSquares(squares), fog: true };
}
