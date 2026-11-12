import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { readVerification } from '@/lib/verification';
import { isSameOriginCommand, readCommandObject } from '@/lib/command-request';
import { accountElectionEnabled } from '@/lib/preview-election';
import { kindleEligibility, previewParticipationReason } from '@/lib/kindle-eligibility';
import { congregationDonationsFlagOn, donateToCongregation, donationAmountOk, donationRequestIdOk, readCongregationDonations } from '@/lib/congregation-donations';

export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
type Bindings = { HARIMU_ACCOUNT_ELECTION_POC_ENABLED?: string; HARIMU_FAITH_ENABLED?: string; NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW?: string };

// #1340: a Kindle member gives Spark to their own congregation's fund. Flag HARIMU_CONGREGATION_DONATIONS_ENABLED off: 404 before auth or any DB access.
// Reads ride GET /api/congregations (the `donations` key exists only with the flag on).
export async function POST(request: Request) {
  if (!congregationDonationsFlagOn(env)) return json({ error: 'Not found.', reason: 'not_found' }, 404);
  if (!isSameOriginCommand(request)) return json({ error: 'Same-origin request required.' }, 403);
  const userId = await authenticatedUserId(request);
  if (!userId) return json({ error: 'Sign in required.' }, 401);
  const bindings = env as unknown as Bindings;
  if (bindings.HARIMU_FAITH_ENABLED !== 'true') return json({ error: 'Congregations are not open yet.', reason: 'disabled' }, 403);
  const db = await getDatabase();
  const nation = (await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string | null }>())?.nation_id;
  if (nation !== 'kindle') return json({ error: 'Congregation donations are for Kindle citizens only.', reason: 'not_kindle' }, 403);
  const eligibility = kindleEligibility(await readVerification(userId), { on: accountElectionEnabled(bindings), reason: previewParticipationReason });
  if (!eligibility.eligible) return json({ error: eligibility.reason, reason: 'not_eligible' }, 403);
  let body: Record<string, unknown>;
  try { body = await readCommandObject(request, 512); } catch { return json({ error: 'Send a donation.', reason: 'bad_request' }, 400); }
  if (!donationAmountOk(body.amountMinor) || !donationRequestIdOk(body.requestId)) return json({ error: 'Send a whole positive amountMinor and a requestId.', reason: 'bad_request' }, 400);
  const result = await donateToCongregation(db, userId, { amountMinor: body.amountMinor, requestId: body.requestId }, Math.floor(Date.now() / 1000));
  return result.ok ? json({ donations: await readCongregationDonations(db, userId) }) : json({ error: result.error, reason: result.reason }, result.status);
}
