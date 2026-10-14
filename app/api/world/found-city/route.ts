import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { isSameOriginCommand, readCommandObject } from '@/lib/command-request';
import { foundCity, parseFoundingCommand } from '@/lib/city-founding';

export const dynamic = 'force-dynamic';
const privateJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

// #124: found a T1 city on Wildlands via the nation's flag-gated stub authority.
export async function POST(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return privateJson({ error: 'Sign in required.' }, 401);
  if (!isSameOriginCommand(request)) return privateJson({ error: 'Same-origin request required.' }, 403);
  let body: Record<string, unknown>;
  try { body = await readCommandObject(request, 2048); } catch { return privateJson({ error: 'Send a founding command.', reason: 'bad_request' }, 400); }
  const command = parseFoundingCommand(body);
  if (!command) return privateJson({ error: 'Send action, integer x/y, a 2–40 letter city name and a requestId.', reason: 'bad_request' }, 400);
  const db = await getDatabase();
  const citizen = await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string }>();
  const enabled = (env as unknown as { HARIMU_CITY_FOUNDING_ENABLED?: string }).HARIMU_CITY_FOUNDING_ENABLED === 'true';
  const result = await foundCity(db, userId, citizen?.nation_id ?? null, command, Math.floor(Date.now() / 1000), enabled);
  return result.ok ? privateJson(result) : privateJson({ error: result.error, reason: result.reason }, result.status);
}
