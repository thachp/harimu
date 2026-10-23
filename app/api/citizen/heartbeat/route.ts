import { authenticatedUserId } from '@/lib/auth';
import { isSameOriginCommand } from '@/lib/command-request';
import { env } from 'cloudflare:workers';
import { getDatabase } from '@/lib/db';
import { dormancyEnabled, heartbeat } from '@/lib/dormancy-rules';

// #739 (ARC): the activity write lives here, not on GET /api/citizen, which stays pure (#205). The client posts once per load.
// Flag HARIMU_DORMANCY_ENABLED off: 404 before any auth or database work. On: last_active_at is bumped at most hourly, and the
// Welcome back info is computed from the prior value, returned only by the request whose guarded UPDATE won (so it shows once).
export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function POST(request: Request) {
  if (!dormancyEnabled(env as never)) return json({ error: 'Not found.', reason: 'not_found' }, 404);
  if (!isSameOriginCommand(request)) return json({ error: 'Same-origin request required.' }, 403);
  const userId = await authenticatedUserId(request);
  if (!userId) return json({ error: 'Sign in required.' }, 401);
  return json(await heartbeat(await getDatabase(), userId, Math.floor(Date.now() / 1000)));
}
