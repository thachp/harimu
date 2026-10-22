import { env } from 'cloudflare:workers';
import { getDatabase } from '@/lib/db';
import { readWorldSquares, mapWidth, mapHeight } from '@/lib/map-zones';
import { ownershipMap } from '@/lib/map-ownership';

// #82 slice 2: read-only square owners for the Ownership overlay. Behind HARIMU_MAP_OVERLAYS_ENABLED: off is a 404 that opens no database. GET only; it never writes.
export const dynamic = 'force-dynamic';
export async function GET() {
  if ((env as unknown as { HARIMU_MAP_OVERLAYS_ENABLED?: string }).HARIMU_MAP_OVERLAYS_ENABLED !== 'true') return Response.json({ error: 'Not found.', reason: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
  const { squares } = await readWorldSquares(await getDatabase());
  return Response.json(ownershipMap(mapWidth, mapHeight, squares), { headers: { 'Cache-Control': 'public, max-age=60' } });
}
