import { env } from 'cloudflare:workers';
import { getDatabase } from '@/lib/db';
import { readWorldSquares, mapWidth, mapHeight } from '@/lib/map-zones';
import { latestStability, stabilityNations } from '@/lib/stability';
import { unrestMap } from '@/lib/map-unrest';

// #82 slice 4: read-only Unrest bands for the Unrest overlay (each nation's latest score on its squares). Behind HARIMU_MAP_OVERLAYS_ENABLED: off is a 404 that opens no database. GET only; it never writes.
export const dynamic = 'force-dynamic';
export async function GET() {
  if ((env as unknown as { HARIMU_MAP_OVERLAYS_ENABLED?: string }).HARIMU_MAP_OVERLAYS_ENABLED !== 'true') return Response.json({ error: 'Not found.', reason: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
  const db = await getDatabase(), { squares } = await readWorldSquares(db), scores: Record<string, number> = {};
  for (const nationId of stabilityNations) { const latest = await latestStability(db, nationId); if (latest) scores[nationId] = latest.unrest; }
  return Response.json(unrestMap(mapWidth, mapHeight, squares, scores), { headers: { 'Cache-Control': 'public, max-age=60' } });
}
