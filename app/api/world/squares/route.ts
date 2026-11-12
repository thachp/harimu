import { env } from 'cloudflare:workers';
import { getDatabase } from '@/lib/db';
import { foggedSquares } from '@/lib/korund-map-fog';
import { readWorldSquares, mapWidth, mapHeight, acquisitionRules, zoneLabels } from '@/lib/map-zones';

const publicCache = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400';

// Public, read-only world geography (#66). Cacheable at the edge.
// #1381: with the fog flag on, every response is private (no shared cache). A signed-in Korund viewer also gets only Korund and adjacent squares.
export async function GET(request: Request) {
  const db = await getDatabase();
  const { squares, source } = await readWorldSquares(db);
  const view = await foggedSquares(request, squares, env, db);
  return Response.json({ width: mapWidth, height: mapHeight, zones: zoneLabels, rules: acquisitionRules, source, squares: view.squares },
    { headers: { 'Cache-Control': view.private ? 'private, no-store' : publicCache } });
}
