import { env } from 'cloudflare:workers';
import { getDatabase } from '@/lib/db';
import { foggedSquares } from '@/lib/korund-map-fog';
import { readWorldSquares, mapWidth, mapHeight } from '@/lib/map-zones';
import { ownershipMap } from '@/lib/map-ownership';

// #82 slice 2: read-only square owners for the Ownership overlay. Behind HARIMU_MAP_OVERLAYS_ENABLED: off is a 404 that opens no database. GET only; it never writes.
// #1381: a signed-in Korund viewer, with the fog flag on, sees owners only on Korund and adjacent squares.
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  if ((env as unknown as { HARIMU_MAP_OVERLAYS_ENABLED?: string }).HARIMU_MAP_OVERLAYS_ENABLED !== 'true') return Response.json({ error: 'Not found.', reason: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
  const db = await getDatabase();
  const { squares } = await readWorldSquares(db);
  const view = await foggedSquares(request, squares, env, db);
  return Response.json(ownershipMap(mapWidth, mapHeight, view.squares), { headers: { 'Cache-Control': view.fog ? 'private, no-store' : 'public, max-age=60' } });
}
