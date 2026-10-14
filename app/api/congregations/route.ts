import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { isSameOriginCommand, readCommandObject } from '@/lib/command-request';
import { parseCongregationCommand, readCongregations, runCongregationCommand } from '@/lib/congregations';

export const dynamic = 'force-dynamic';
const privateJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const faithEnabled = () => (env as unknown as { HARIMU_FAITH_ENABLED?: string }).HARIMU_FAITH_ENABLED === 'true';

// #224: city faith panel (headcount and Officiant per congregation). Read-only (#217/#246); signed-out callers get the public panel.
export async function GET(request: Request) {
  const userId = await authenticatedUserId(request);
  return privateJson(await readCongregations(await getDatabase(), userId ?? null, Math.floor(Date.now() / 1000), faithEnabled()));
}

// #224: join-congregation / leave-congregation (once per game day), stand-for-officiant / stand-down, officiate (once per game day).
export async function POST(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return privateJson({ error: 'Sign in required.' }, 401);
  if (!isSameOriginCommand(request)) return privateJson({ error: 'Same-origin request required.' }, 403);
  let body: Record<string, unknown>;
  try { body = await readCommandObject(request, 1024); } catch { return privateJson({ error: 'Send a congregation command.', reason: 'bad_request' }, 400); }
  const command = parseCongregationCommand(body);
  if (!command) return privateJson({ error: 'Send action join-congregation, leave-congregation, stand-for-officiant, stand-down or officiate, with a requestId.', reason: 'bad_request' }, 400);
  const result = await runCongregationCommand(await getDatabase(), userId, command, Math.floor(Date.now() / 1000), faithEnabled());
  return result.ok ? privateJson(result) : privateJson({ error: result.error, reason: result.reason }, result.status);
}
