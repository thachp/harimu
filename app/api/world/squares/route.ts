import { getDatabase } from '@/lib/db';
import { readWorldSquares, mapWidth, mapHeight, acquisitionRules, zoneLabels } from '@/lib/map-zones';

// Public, read-only world geography (#66). Cacheable at the edge.
export async function GET() {
  const { squares, source } = await readWorldSquares(await getDatabase());
  return Response.json({ width: mapWidth, height: mapHeight, zones: zoneLabels, rules: acquisitionRules, source, squares },
    { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400' } });
}
