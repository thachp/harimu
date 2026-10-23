import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { isSameOriginCommand, readCommandObject } from '@/lib/command-request';
import { armiesEnabled } from '@/lib/army-rules';
import { releaseExpired, runDraft, stayAfterTerm } from '@/lib/army-conscription';

export const dynamic = 'force-dynamic';
const privateJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

// #738 slice 3 follow-up (ARC on #839): the card posts {action:'open'} once per load. That releases conscripts whose term ended and runs this game
// week's Korund lottery or Aurelle levy once; {action:'stay'} keeps a serving conscript in the unit after the term. Same flags as /api/army:
// either off is 404 before auth or any DB access.
export async function POST(request: Request) {
  if (!armiesEnabled(env)) return privateJson({ error: 'Not found.', reason: 'not_found' }, 404);
  const userId = await authenticatedUserId(request);
  if (!userId) return privateJson({ error: 'Sign in required.' }, 401);
  if (!isSameOriginCommand(request)) return privateJson({ error: 'Same-origin request required.' }, 403);
  let body: Record<string, unknown>;
  try { body = await readCommandObject(request, 256); } catch { return privateJson({ error: 'Send open or stay.', reason: 'bad_request' }, 400); }
  if (body.action !== 'open' && body.action !== 'stay') return privateJson({ error: 'Send open or stay.', reason: 'bad_request' }, 400);
  const db = await getDatabase(), now = Math.floor(Date.now() / 1000);
  if (body.action === 'stay') return (await stayAfterTerm(db, userId, now)) ? privateJson({ stayed: true }) : privateJson({ error: 'You are not serving a term.', reason: 'not_conscripted' }, 409);
  const nation = await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id = ?').bind(userId).first<{ nation_id: string | null }>();
  if (!nation?.nation_id) return privateJson({ drafted: null });
  await releaseExpired(db, nation.nation_id, now);
  return privateJson({ drafted: await runDraft(db, nation.nation_id, now) });
}
