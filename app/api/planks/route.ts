import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { readVerification } from '@/lib/verification';
import { isSameOriginCommand, readCommandObject } from '@/lib/command-request';
import { accountElectionEnabled } from '@/lib/preview-election';
import { kindleEligibility, previewParticipationReason } from '@/lib/kindle-eligibility';
import { plankVotesFlagOn, readPlanks, runPlankCommand } from '@/lib/plank-votes';

export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const notFound = () => json({ error: 'Not found.', reason: 'not_found' }, 404);
type Bindings = { HARIMU_ACCOUNT_ELECTION_POC_ENABLED?: string; NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW?: string };

// #831: Kindle platform plank up-votes. Flag HARIMU_PLANK_VOTES_ENABLED off: 404 before auth or any DB access.
async function kindleCitizen(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return { error: json({ error: 'Sign in required.' }, 401) };
  const db = await getDatabase();
  const nation = (await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string | null }>())?.nation_id;
  if (nation !== 'kindle') return { error: json({ error: 'Party planks are for Kindle citizens only.', reason: 'not_kindle' }, 403) };
  const eligibility = kindleEligibility(await readVerification(userId), { on: accountElectionEnabled(env as unknown as Bindings), reason: previewParticipationReason });
  return { userId, db, eligibility };
}
export async function GET(request: Request) {
  if (!plankVotesFlagOn(env)) return notFound();
  const c = await kindleCitizen(request); if (c.error) return c.error;
  return json({ planks: await readPlanks(c.db, c.userId), eligible: c.eligibility.eligible });
}
export async function POST(request: Request) {
  if (!plankVotesFlagOn(env)) return notFound();
  if (!isSameOriginCommand(request)) return json({ error: 'Same-origin request required.' }, 403);
  const c = await kindleCitizen(request); if (c.error) return c.error;
  if (!c.eligibility.eligible) return json({ error: c.eligibility.reason, reason: 'not_eligible' }, 403);
  let body: Record<string, unknown>;
  try { body = await readCommandObject(request, 512); } catch { return json({ error: 'Send a plank command.', reason: 'bad_request' }, 400); }
  if ((body.action !== 'upvote' && body.action !== 'withdraw') || typeof body.pledgeKey !== 'string') return json({ error: 'Send action upvote or withdraw with a pledgeKey.', reason: 'bad_request' }, 400);
  const result = await runPlankCommand(c.db, c.userId, { action: body.action, pledgeKey: body.pledgeKey }, Math.floor(Date.now() / 1000));
  return result.ok ? json({ planks: await readPlanks(c.db, c.userId) }) : json({ error: result.error, reason: result.reason }, result.status);
}
