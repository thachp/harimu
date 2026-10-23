import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { readCivicRank } from '@/lib/civic-rank';
import { civicRankFlagOn } from '@/lib/civic-rank-rules';

// #741: read-only civic rank (Kindle). Flag off: 404 before auth or any database read. GET only; it never writes.
export const dynamic = 'force-dynamic';
const privateJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function GET(request: Request) {
  if (!civicRankFlagOn(env)) return privateJson({ error: 'Not found.', reason: 'not_found' }, 404);
  const userId = await authenticatedUserId(request);
  if (!userId) return privateJson({ error: 'Sign in required.' }, 401);
  const db = await getDatabase();
  const citizen = await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string | null }>();
  return privateJson({ civicRank: await readCivicRank(db, userId, citizen?.nation_id) });
}
