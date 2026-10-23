import { authenticatedUserId } from '@/lib/auth';
import { isSameOriginCommand } from '@/lib/command-request';
import { env } from 'cloudflare:workers';
import { getDatabase } from '@/lib/db';
import { dormancyEnabled, heartbeat } from '@/lib/dormancy-rules';
import { applySavingsShield, savingsShieldEnabled } from '@/lib/savings-shield';
import { readVerification } from '@/lib/verification';
import { kindleEligibility } from '@/lib/kindle-eligibility';
import { accountElectionEnabled } from '@/lib/preview-election';

// #739 (ARC): the activity write lives here, not on GET /api/citizen, which stays pure (#205). The client posts once per load.
// Flag HARIMU_DORMANCY_ENABLED off: 404 before any auth or database work. On: last_active_at is bumped at most hourly, and the
// Welcome back info is computed from the prior value, returned only by the request whose guarded UPDATE won (so it shows once).
export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function POST(request: Request) {
  if (!dormancyEnabled(env as never)) return json({ error: 'Not found.', reason: 'not_found' }, 404);
  if (!isSameOriginCommand(request)) return json({ error: 'Same-origin request required.' }, 403);
  const userId = await authenticatedUserId(request);
  if (!userId) return json({ error: 'Sign in required.' }, 401);
  const db = await getDatabase(), now = Math.floor(Date.now() / 1000);
  const result = await heartbeat(db, userId, now);
  // #824: on a Welcome back from Dormant or Archived, the Savings Shield credits once per absence. Flag off: not read, not written, no copy change.
  const back = result.welcomeBack;
  if (back && back.status !== 'away' && savingsShieldEnabled(env as never)) {
    const verified = kindleEligibility(await readVerification(userId), { on: accountElectionEnabled(env as never), reason: '' }).eligible;
    const shield = await applySavingsShield(db, userId, Math.floor(Date.parse(back.since) / 1000), now, verified);
    if (shield?.status === 'paid' && !shield.replayed) return json({ ...result, welcomeBack: { ...back, shield: { creditMinor: shield.creditMinor } } });
  }
  return json(result);
}
