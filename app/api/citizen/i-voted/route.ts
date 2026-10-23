import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { iVotedFlagOn, readIVoted } from '@/lib/i-voted';

export const dynamic = 'force-dynamic';
const privateJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

// #782: the caller's own "I Voted" badges (read-only). Flag HARIMU_I_VOTED_BADGE_ENABLED off: 404 before auth or any DB access.
export async function GET(request: Request) {
  if (!iVotedFlagOn(env)) return privateJson({ error: 'Not found.', reason: 'not_found' }, 404);
  const userId = await authenticatedUserId(request);
  if (!userId) return privateJson({ error: 'Sign in required.' }, 401);
  return privateJson({ badges: await readIVoted(await getDatabase(), userId) });
}
