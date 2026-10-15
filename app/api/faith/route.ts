import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { isSameOriginCommand, readCommandObject } from '@/lib/command-request';
import { attendWorship, chooseFaith, joinFestival, parseFaithCommand, readFaith, worshipUnderground } from '@/lib/faith';
import { travelBlock } from '@/lib/travel';

export const dynamic = 'force-dynamic';
const privateJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const flags = () => env as unknown as { HARIMU_FAITH_ENABLED?: string; HARIMU_TRAVEL_ENABLED?: string };
const faithEnabled = () => flags().HARIMU_FAITH_ENABLED === 'true';

// #67: faith, Devotion and worship state. Read-only (#217/#246): Devotion is derived, nothing is written here.
export async function GET(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return privateJson({ error: 'Sign in required.' }, 401);
  return privateJson(await readFaith(await getDatabase(), userId, Math.floor(Date.now() / 1000), faithEnabled()));
}

// #67: choose-faith (once per 60 real days) and attend-worship (once per game day, idempotent per requestId).
export async function POST(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return privateJson({ error: 'Sign in required.' }, 401);
  if (!isSameOriginCommand(request)) return privateJson({ error: 'Same-origin request required.' }, 403);
  let body: Record<string, unknown>;
  try { body = await readCommandObject(request, 1024); } catch { return privateJson({ error: 'Send a faith command.', reason: 'bad_request' }, 400); }
  const command = parseFaithCommand(body);
  if (!command) return privateJson({ error: 'Send action "choose-faith" with faithId, "attend-worship", "worship-underground", or "join-festival" with festivalId, and a requestId.', reason: 'bad_request' }, 400);
  const db = await getDatabase(); const now = Math.floor(Date.now() / 1000);
  if (command.action === 'attend-worship' || command.action === 'join-festival') {
    // Worship and festivals happens at the city temple/meeting house, so it waits for arrival like other location-bound actions (#123).
    const blocked = await travelBlock(db, userId, now, flags().HARIMU_TRAVEL_ENABLED === 'true');
    if (blocked) return privateJson({ error: blocked, reason: 'traveling' }, 409);
  }
  const result = command.action === 'attend-worship' ? await attendWorship(db, userId, command.requestId, now, faithEnabled())
    : command.action === 'join-festival' ? await joinFestival(db, userId, command, now, faithEnabled()) // #68
    : command.action === 'worship-underground' ? await worshipUnderground(db, userId, command.requestId, now, faithEnabled()) // #295: at home, so no travel wait
    : await chooseFaith(db, userId, command, now, faithEnabled());
  return result.ok ? privateJson(result) : privateJson({ error: result.error, reason: result.reason }, result.status);
}
