import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { isSameOriginCommand, readCommandObject } from '@/lib/command-request';
import { harmonyEnabled } from '@/lib/religious-harmony';
import { parseHarmonyAct, runHarmonyAct } from '@/lib/holy-sites';

export const dynamic = 'force-dynamic';
const privateJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

// #855: {action:'pilgrimage', siteId, requestId} or {action:'charity', requestId}. Flag off: 404 before auth. POST only (no GET).
export async function POST(request: Request) {
  if (!harmonyEnabled(env)) return privateJson({ error: 'Not found.' }, 404);
  const userId = await authenticatedUserId(request);
  if (!userId) return privateJson({ error: 'Sign in required.' }, 401);
  if (!isSameOriginCommand(request)) return privateJson({ error: 'Same-origin request required.' }, 403);
  let body: Record<string, unknown>;
  try { body = await readCommandObject(request, 512); } catch { return privateJson({ error: 'Send pilgrimage or charity.', reason: 'bad_request' }, 400); }
  const command = parseHarmonyAct(body);
  if (!command) return privateJson({ error: 'Send action "pilgrimage" with siteId, or "charity", and a requestId.', reason: 'bad_request' }, 400);
  const r = await runHarmonyAct(await getDatabase(), userId, command, Math.floor(Date.now() / 1000));
  return r.ok ? privateJson(r) : privateJson({ error: r.error, reason: r.reason }, r.status);
}
