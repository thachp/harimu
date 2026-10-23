import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { readVerification } from '@/lib/verification';
import { isSameOriginCommand, readCommandObject } from '@/lib/command-request';
import { accountElectionEnabled } from '@/lib/preview-election';
import { kindleEligibility, previewParticipationReason } from '@/lib/kindle-eligibility';
import { attendRally, ralliesFlagOn, readRallies } from '@/lib/rallies';

export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
type Bindings = { HARIMU_ACCOUNT_ELECTION_POC_ENABLED?: string; NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW?: string };
const now = () => Math.floor(Date.now() / 1000);

// #867: Kindle rallies. Flag HARIMU_KINDLE_RALLIES_ENABLED off: 404 before auth or any DB access.
async function kindleCitizen(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return { error: json({ error: 'Sign in required.' }, 401) };
  const db = await getDatabase();
  const nation = (await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string | null }>())?.nation_id;
  if (nation !== 'kindle') return { error: json({ error: 'Rallies are for Kindle citizens only.', reason: 'not_kindle' }, 403) };
  return { userId, db, eligibility: kindleEligibility(await readVerification(userId), { on: accountElectionEnabled(env as unknown as Bindings), reason: previewParticipationReason }) };
}
export async function GET(request: Request) {
  if (!ralliesFlagOn(env)) return json({ error: 'Not found.', reason: 'not_found' }, 404);
  const c = await kindleCitizen(request); if (c.error) return c.error;
  return json({ rallies: await readRallies(c.db, c.userId, now()), eligible: c.eligibility.eligible });
}
export async function POST(request: Request) {
  if (!ralliesFlagOn(env)) return json({ error: 'Not found.', reason: 'not_found' }, 404);
  if (!isSameOriginCommand(request)) return json({ error: 'Same-origin request required.' }, 403);
  const c = await kindleCitizen(request); if (c.error) return c.error;
  if (!c.eligibility.eligible) return json({ error: c.eligibility.reason, reason: 'not_eligible' }, 403);
  let body: Record<string, unknown>;
  try { body = await readCommandObject(request, 256); } catch { return json({ error: 'Send a rallyId.', reason: 'bad_request' }, 400); }
  if (typeof body.rallyId !== 'string') return json({ error: 'Send a rallyId.', reason: 'bad_request' }, 400);
  const t = now(), result = await attendRally(c.db, c.userId, body.rallyId, t);
  return result.ok ? json({ rallies: await readRallies(c.db, c.userId, t) }) : json({ error: result.error, reason: result.reason }, result.status);
}
