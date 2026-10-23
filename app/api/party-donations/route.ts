import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { readVerification } from '@/lib/verification';
import { isSameOriginCommand, readCommandObject } from '@/lib/command-request';
import { accountElectionEnabled } from '@/lib/preview-election';
import { kindleEligibility, previewParticipationReason } from '@/lib/kindle-eligibility';
import { donate, donationAmountOk, donationRequestIdOk, partyDonationsFlagOn, readDonations } from '@/lib/party-donations';

export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const notFound = () => json({ error: 'Not found.', reason: 'not_found' }, 404);
type Bindings = { HARIMU_ACCOUNT_ELECTION_POC_ENABLED?: string; NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW?: string };
const now = () => Math.floor(Date.now() / 1000);

// #863: Kindle campaign donations. Flag HARIMU_PARTY_DONATIONS_ENABLED off: 404 before auth or any DB access.
async function kindleCitizen(userId: string) {
  const db = await getDatabase();
  const nation = (await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string | null }>())?.nation_id;
  const eligibility = kindleEligibility(await readVerification(userId), { on: accountElectionEnabled(env as unknown as Bindings), reason: previewParticipationReason });
  return { db, kindle: nation === 'kindle', eligibility };
}
/** Public disclosure: anyone may read every party's donations and total raised. */
export async function GET(request: Request) {
  if (!partyDonationsFlagOn(env)) return notFound();
  const userId = await authenticatedUserId(request);
  if (!userId) return json({ donations: await readDonations(await getDatabase(), null, now()), eligible: false });
  const c = await kindleCitizen(userId);
  return json({ donations: await readDonations(c.db, c.kindle ? userId : null, now()), eligible: c.kindle && c.eligibility.eligible });
}
export async function POST(request: Request) {
  if (!partyDonationsFlagOn(env)) return notFound();
  if (!isSameOriginCommand(request)) return json({ error: 'Same-origin request required.' }, 403);
  const userId = await authenticatedUserId(request);
  if (!userId) return json({ error: 'Sign in required.' }, 401);
  const c = await kindleCitizen(userId);
  if (!c.kindle) return json({ error: 'Party donations are for Kindle citizens only.', reason: 'not_kindle' }, 403);
  if (!c.eligibility.eligible) return json({ error: c.eligibility.reason, reason: 'not_eligible' }, 403);
  let body: Record<string, unknown>;
  try { body = await readCommandObject(request, 512); } catch { return json({ error: 'Send a donation.', reason: 'bad_request' }, 400); }
  if (typeof body.partyId !== 'string' || !donationAmountOk(body.amountMinor) || !donationRequestIdOk(body.requestId)) return json({ error: 'Send a partyId, a whole positive amountMinor and a requestId.', reason: 'bad_request' }, 400);
  const t = now(), result = await donate(c.db, userId, { partyId: body.partyId, amountMinor: body.amountMinor, requestId: body.requestId }, t);
  return result.ok ? json({ donations: await readDonations(c.db, userId, t) }) : json({ error: result.error, reason: result.reason }, result.status);
}
