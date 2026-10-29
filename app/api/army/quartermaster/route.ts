import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { isSameOriginCommand, readCommandObject } from '@/lib/command-request';
import { parseDrill } from '@/lib/army-rules';
import { armyQuartermasterEnabled, runQuartermasterShift } from '@/lib/army-quartermaster';
import { armyBattlesEnabled } from '@/lib/army-battle';
import { readWoundedUntil, woundedRefusal } from '@/lib/army-wounds';

export const dynamic = 'force-dynamic';
const privateJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

// #1053: a quartermaster shift, once per game day per unit member (the drill pattern). HARIMU_ARMY_QUARTERMASTER_ENABLED and the supply chain "true", else 404 before auth or any DB access.
export async function POST(request: Request) {
  if (!armyQuartermasterEnabled(env)) return privateJson({ error: 'Not found.', reason: 'not_found' }, 404);
  const userId = await authenticatedUserId(request);
  if (!userId) return privateJson({ error: 'Sign in required.' }, 401);
  if (!isSameOriginCommand(request)) return privateJson({ error: 'Same-origin request required.' }, 403);
  let body: Record<string, unknown>;
  try { body = await readCommandObject(request, 256); } catch { return privateJson({ error: 'Send a shift with a requestId.', reason: 'bad_request' }, 400); }
  const shift = parseDrill(body);
  if (!shift) return privateJson({ error: 'Send a shift with a requestId.', reason: 'bad_request' }, 400);
  const db = await getDatabase(), now = Math.floor(Date.now() / 1000);
  // Wounded citizens cannot take the shift (the #911 drill rule; flag off: no extra read).
  if (armyBattlesEnabled(env)) { const wounded = await readWoundedUntil(db, userId, now); if (wounded) return privateJson(woundedRefusal(wounded), 409); }
  const result = await runQuartermasterShift(db, userId, shift.requestId, now);
  return result.ok ? privateJson({ ok: true, replayed: result.replayed }) : privateJson({ error: result.error, reason: result.reason }, result.status);
}
