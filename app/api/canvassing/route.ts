import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { readVerification } from '@/lib/verification';
import { isSameOriginCommand, readCommandObject } from '@/lib/command-request';
import { validPetitionId } from '@/lib/collective-petitions';
import { accountElectionEnabled } from '@/lib/preview-election';
import { kindleEligibility, previewParticipationReason } from '@/lib/kindle-eligibility';
import { recoveryInterval } from '@/lib/economy';
import { recoveryIntervalForHome, spaWcBonusEnabled } from '@/lib/spa-recovery'; // #798
import { canvassingEnabled, completeQuest, readCanvassing, startQuest, type CanvassingBindings } from '@/lib/canvassing';

export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const bindings = () => env as unknown as CanvassingBindings;
const baseInterval = () => recoveryInterval(bindings().HARIMU_CAPACITY_RECOVERY_SECONDS);
const intervalFor = (db: Awaited<ReturnType<typeof getDatabase>>, userId: string) => recoveryIntervalForHome(db, userId, baseInterval(), spaWcBonusEnabled(env));

// #442: Kindle canvassing. Off unless HARIMU_CANVASSING_ENABLED=true; while off both methods do nothing (no auth, no database).
// GET is read-only. Visibility is display-only and never reaches a ballot count.
async function kindleCitizen(userId: string) {
  const db = await getDatabase();
  return { db, kindle: (await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string | null }>())?.nation_id === 'kindle' };
}
/** The presidential ballot's eligibility (same rule as the town halls, #441): a verified human (Tier 1), or the approved account-level preview exception. */
async function eligibility(userId: string) {
  return kindleEligibility(await readVerification(userId), { on: accountElectionEnabled(bindings()), reason: previewParticipationReason });
}

export async function GET(request: Request) {
  if (!canvassingEnabled(bindings())) return json({ enabled: false }, 404);
  const userId = await authenticatedUserId(request);
  if (!userId) return json({ error: 'Sign in required.' }, 401);
  const { db, kindle } = await kindleCitizen(userId);
  if (!kindle) return json({ error: 'Canvassing is for Kindle citizens only.' }, 403);
  return json({ ...await readCanvassing(db, userId, Math.floor(Date.now() / 1000), await intervalFor(db, userId)), eligibility: await eligibility(userId) });
}

export async function POST(request: Request) {
  if (!isSameOriginCommand(request)) return json({ error: 'Same-origin request required.' }, 403);
  if (!canvassingEnabled(bindings())) return json({ enabled: false }, 404);
  const userId = await authenticatedUserId(request);
  if (!userId) return json({ error: 'Sign in required.' }, 401);
  const { db, kindle } = await kindleCitizen(userId);
  if (!kindle) return json({ error: 'Canvassing is for Kindle citizens only.' }, 403);
  const eligible = await eligibility(userId);
  if (!eligible.eligible) return json({ error: eligible.reason, verification: eligible.verification }, 403);
  let body: Record<string, unknown>;
  try { body = await readCommandObject(request, 512); } catch { return json({ error: 'Expected a bounded canvassing command.' }, 400); }
  if ((body.action !== 'start' && body.action !== 'complete') || !validPetitionId(body.requestId)) return json({ error: 'Use a valid action and request id.' }, 400);
  const now = Math.floor(Date.now() / 1000);
  const wcInterval = await intervalFor(db, userId);
  const result = body.action === 'start' ? await startQuest(db, userId, now, wcInterval, { requestId: body.requestId }) : await completeQuest(db, userId, now, { questId: body.questId, requestId: body.requestId });
  if (!result.ok) return json({ error: result.error }, result.status);
  return json({ ok: true, alreadyRecorded: result.alreadyRecorded, ...await readCanvassing(db, userId, now, wcInterval), eligibility: eligible });
}
