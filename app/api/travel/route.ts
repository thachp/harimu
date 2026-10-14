import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { isSameOriginCommand, readCommandObject } from '@/lib/command-request';
import { parseTravelCommand, readTravel, startTravel } from '@/lib/travel';

export const dynamic = 'force-dynamic';
const privateJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const travelEnabled = () => (env as unknown as { HARIMU_TRAVEL_ENABLED?: string }).HARIMU_TRAVEL_ENABLED === 'true';

// #123: read location + travel state (read-only), and start a journey.
export async function GET(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return privateJson({ error: 'Sign in required.' }, 401);
  return privateJson(await readTravel(await getDatabase(), userId, Math.floor(Date.now() / 1000), travelEnabled()));
}

export async function POST(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return privateJson({ error: 'Sign in required.' }, 401);
  if (!isSameOriginCommand(request)) return privateJson({ error: 'Same-origin request required.' }, 403);
  let body: Record<string, unknown>;
  try { body = await readCommandObject(request, 1024); } catch { return privateJson({ error: 'Send a start-travel command.', reason: 'bad_request' }, 400); }
  const command = parseTravelCommand(body);
  if (!command) return privateJson({ error: 'Send action "start-travel", integer x/y and a requestId.', reason: 'bad_request' }, 400);
  const result = await startTravel(await getDatabase(), userId, command, Math.floor(Date.now() / 1000), travelEnabled());
  return result.ok ? privateJson(result) : privateJson({ error: result.error, reason: result.reason }, result.status);
}
