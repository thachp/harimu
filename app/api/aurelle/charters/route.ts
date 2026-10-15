import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { isSameOriginCommand, readCommandObject } from '@/lib/command-request';
import { royalFavorBalance } from '@/lib/aurelle';
import { actCharter, parseCharterCommand, readCharter, revokeCharter } from '@/lib/aurelle-charters';
import { charterGrantFavorCost, charterRenewFavorCost, charterRenewWindowSeconds, charterTermSeconds } from '@/lib/aurelle-charter-rules';
import { qaTestCitizenAllowed, type QaBindings } from '@/lib/qa-tools';

export const dynamic = 'force-dynamic';
const privateJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const flags = () => env as unknown as QaBindings & { HARIMU_AURELLE_CHARTERS_ENABLED?: string; HARIMU_FAVOR_DECAY_ENABLED?: string };
const notFound = () => privateJson({ error: 'Not found.', reason: 'disabled' }, 404);
const favorDecayAt = (now: number) => flags().HARIMU_FAVOR_DECAY_ENABLED === 'true' ? now : undefined;

// #531: Aurelle guild charter PoC. Flag HARIMU_AURELLE_CHARTERS_ENABLED off (the shipped default) is a 404 before anything else (auth, validation, reads and writes).
export async function GET(request: Request) {
  if (flags().HARIMU_AURELLE_CHARTERS_ENABLED !== 'true') return notFound();
  const userId = await authenticatedUserId(request);
  if (!userId) return privateJson({ error: 'Sign in required.' }, 401);
  const db = await getDatabase(); const now = Math.floor(Date.now() / 1000);
  return privateJson({ charter: await readCharter(db, userId, now), favor: await royalFavorBalance(db, userId, favorDecayAt(now)),
    rules: { grantFavorCost: charterGrantFavorCost, renewFavorCost: charterRenewFavorCost, termSeconds: charterTermSeconds, renewWindowSeconds: charterRenewWindowSeconds } });
}

export async function POST(request: Request) {
  if (flags().HARIMU_AURELLE_CHARTERS_ENABLED !== 'true') return notFound();
  const userId = await authenticatedUserId(request);
  if (!userId) return privateJson({ error: 'Sign in required.' }, 401);
  if (!isSameOriginCommand(request)) return privateJson({ error: 'Same-origin request required.' }, 403);
  let body: Record<string, unknown>;
  try { body = await readCommandObject(request, 512); } catch { return privateJson({ error: 'Send a charter command.', reason: 'bad_request' }, 400); }
  const db = await getDatabase(); const now = Math.floor(Date.now() / 1000);
  if (body.action === 'revoke-charter') { // operator/QA only: a normal citizen cannot tell the command exists
    if (!qaTestCitizenAllowed(flags(), userId)) return privateJson({ error: 'Not found.' }, 404);
    if (typeof body.targetUserId !== 'string' || !body.targetUserId || body.targetUserId.length > 128) return privateJson({ error: 'Send targetUserId.', reason: 'bad_request' }, 400);
    return privateJson(await revokeCharter(db, body.targetUserId, now));
  }
  const command = parseCharterCommand(body);
  if (!command) return privateJson({ error: 'Send action "request-charter" or "renew-charter" with a valid requestId.', reason: 'bad_request' }, 400);
  const result = await actCharter(db, userId, command, now, favorDecayAt(now));
  return result.ok ? privateJson(result) : privateJson({ error: result.error, reason: result.reason }, result.status);
}
