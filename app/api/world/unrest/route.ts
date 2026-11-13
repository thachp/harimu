import { env } from 'cloudflare:workers';
import { getDatabase } from '@/lib/db';
import { foggedSquares } from '@/lib/korund-map-fog';
import { readWorldSquares, mapWidth, mapHeight } from '@/lib/map-zones';
import { readPublicStability } from '@/lib/stability';
import { unrestMap } from '@/lib/map-unrest';

// #82 slice 4: read-only Unrest bands for the Unrest overlay (each nation's latest score on its squares). Behind HARIMU_MAP_OVERLAYS_ENABLED: off is a 404 that opens no database. GET only; it never writes.
// #1409: a signed-in Korund viewer, with the fog flag on, sees unrest cells only on Korund and adjacent squares, and nation scores only for owners of those squares.
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  if ((env as unknown as { HARIMU_MAP_OVERLAYS_ENABLED?: string }).HARIMU_MAP_OVERLAYS_ENABLED !== 'true') return Response.json({ error: 'Not found.', reason: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
  const db = await getDatabase(), { squares } = await readWorldSquares(db), scores: Record<string, number> = {};
  // #747: the public view only. Korund is 'state-approved' (GDD 8.6 / #95): only its id goes out, never a score or band. A missing stability table reads as [] (no 500).
  const unpublished: string[] = [];
  for (const row of await readPublicStability(db)) { if (row.kind === 'measured') scores[row.nationId] = row.unrest; else unpublished.push(row.nationId); }
  const view = await foggedSquares(request, squares, env, db);
  const visible = new Set(view.squares.flatMap(square => (square.owner ? [square.owner] : [])));
  const visibleScores = Object.fromEntries(Object.entries(scores).filter(([id]) => visible.has(id)));
  return Response.json(unrestMap(mapWidth, mapHeight, view.squares, visibleScores, unpublished.filter(id => visible.has(id))), { headers: { 'Cache-Control': view.private ? 'private, no-store' : 'public, max-age=60' } });
}
