import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { readVerification } from '@/lib/verification';
import { isSameOriginCommand, readCommandObject } from '@/lib/command-request';
import { accountElectionEnabled } from '@/lib/preview-election';
import { kindleEligibility, previewParticipationReason } from '@/lib/kindle-eligibility';
import { pollingFlagOn } from '@/lib/polling-rules';
import { readPolling, runPollCommand, type PollCommand } from '@/lib/polling';

export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const notFound = () => json({ error: 'Not found.', reason: 'not_found' }, 404);
type Bindings = { HARIMU_KINDLE_POLLING_ENABLED?: string; NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW?: string; HARIMU_ACCOUNT_ELECTION_POC_ENABLED?: string };

// #740 slice 1: Kindle voter-intent polling. Flag HARIMU_KINDLE_POLLING_ENABLED off: 404 before auth or any DB access.
// GET may publish today's snapshot once (first read of the real day); it never returns another citizen's answer.
async function kindleCitizen(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return { error: json({ error: 'Sign in required.' }, 401) };
  const db = await getDatabase();
  const nation = (await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string | null }>())?.nation_id;
  if (nation !== 'kindle') return { error: json({ error: 'Polling is for Kindle citizens only.', reason: 'not_kindle' }, 403) };
  const eligibility = kindleEligibility(await readVerification(userId), { on: accountElectionEnabled(env as unknown as Bindings), reason: previewParticipationReason });
  return { userId, db, eligibility };
}
export async function GET(request: Request) {
  if (!pollingFlagOn(env)) return notFound();
  const c = await kindleCitizen(request); if (c.error) return c.error;
  return json({ polling: await readPolling(c.db, c.userId, Math.floor(Date.now() / 1000)), eligible: c.eligibility.eligible });
}
export async function POST(request: Request) {
  if (!pollingFlagOn(env)) return notFound();
  if (!isSameOriginCommand(request)) return json({ error: 'Same-origin request required.' }, 403);
  const c = await kindleCitizen(request); if (c.error) return c.error;
  if (!c.eligibility.eligible) return json({ error: c.eligibility.reason, reason: 'not_eligible' }, 403);
  let body: Record<string, unknown>;
  try { body = await readCommandObject(request, 512); } catch { return json({ error: 'Send a poll answer.', reason: 'bad_request' }, 400); }
  const command: PollCommand | null = body.action === 'decline' ? { action: 'decline' }
    : body.action === 'answer' && typeof body.candidateId === 'string' && typeof body.requestId === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(body.requestId) ? { action: 'answer', candidateId: body.candidateId, requestId: body.requestId } : null;
  if (!command) return json({ error: 'Send action answer (candidateId, requestId) or decline.', reason: 'bad_request' }, 400);
  const now = Math.floor(Date.now() / 1000), result = await runPollCommand(c.db, c.userId, command, now);
  return result.ok ? json({ polling: await readPolling(c.db, c.userId, now) }) : json({ error: result.error, reason: result.reason }, result.status);
}
