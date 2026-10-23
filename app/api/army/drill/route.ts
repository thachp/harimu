import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { isSameOriginCommand, readCommandObject } from '@/lib/command-request';
import { armyDrillsEnabled, parseDrill } from '@/lib/army-rules';
import { runDrill } from '@/lib/army';

export const dynamic = 'force-dynamic';
const privateJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

// #738 slice 2: drill with your unit, once per game day. HARIMU_ARMY_DRILLS_ENABLED (plus both slice-1 flags) "true", else 404 before auth or any DB access.
export async function POST(request: Request) {
  if (!armyDrillsEnabled(env)) return privateJson({ error: 'Not found.', reason: 'not_found' }, 404);
  const userId = await authenticatedUserId(request);
  if (!userId) return privateJson({ error: 'Sign in required.' }, 401);
  if (!isSameOriginCommand(request)) return privateJson({ error: 'Same-origin request required.' }, 403);
  let body: Record<string, unknown>;
  try { body = await readCommandObject(request, 256); } catch { return privateJson({ error: 'Send a drill with a requestId.', reason: 'bad_request' }, 400); }
  const drill = parseDrill(body);
  if (!drill) return privateJson({ error: 'Send a drill with a requestId.', reason: 'bad_request' }, 400);
  const result = await runDrill(await getDatabase(), userId, drill.requestId, Math.floor(Date.now() / 1000));
  return result.ok ? privateJson({ army: result.view, replayed: result.replayed }) : privateJson({ error: result.error, reason: result.reason }, result.status);
}
