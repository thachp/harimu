import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { readVerification } from '@/lib/verification';
import { isSameOriginCommand, readCommandObject } from '@/lib/command-request';
import { validPetitionId } from '@/lib/collective-petitions';
import { accountElectionEnabled } from '@/lib/preview-election';
import { kindleEligibility, previewParticipationReason } from '@/lib/kindle-eligibility';
import { askQuestion, readTownHalls, townHallOpenAt, townHallsEnabled, voteQuestion, type TownHallBindings } from '@/lib/town-hall';

export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const bindings = () => env as unknown as TownHallBindings;

// #441: Kindle town halls. Off unless HARIMU_TOWN_HALLS_ENABLED=true; while off both methods do nothing (no auth, no database).
// GET is read-only: no hall row is created. The AI answers are written only by the scheduled Worker, never here.
async function kindleCitizen(userId: string) {
  const db = await getDatabase();
  return { db, kindle: (await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string | null }>())?.nation_id === 'kindle' };
}
/** The presidential ballot's eligibility: a verified human (Tier 1), or the approved account-level preview exception. */
async function eligibility(userId: string) {
  return kindleEligibility(await readVerification(userId), { on: accountElectionEnabled(bindings()), reason: previewParticipationReason });
}

export async function GET(request: Request) {
  if (!townHallsEnabled(bindings())) return json({ enabled: false }, 404);
  const userId = await authenticatedUserId(request);
  if (!userId) return json({ error: 'Sign in required.' }, 401);
  const { db, kindle } = await kindleCitizen(userId);
  if (!kindle) return json({ error: 'Town halls are for Kindle citizens only.' }, 403);
  return json({ ...await readTownHalls(db, userId, Math.floor(Date.now() / 1000), townHallOpenAt(bindings())), eligibility: await eligibility(userId) });
}

export async function POST(request: Request) {
  if (!isSameOriginCommand(request)) return json({ error: 'Same-origin request required.' }, 403);
  if (!townHallsEnabled(bindings())) return json({ enabled: false }, 404);
  const userId = await authenticatedUserId(request);
  if (!userId) return json({ error: 'Sign in required.' }, 401);
  const { db, kindle } = await kindleCitizen(userId);
  if (!kindle) return json({ error: 'Town halls are for Kindle citizens only.' }, 403);
  const eligible = await eligibility(userId);
  if (!eligible.eligible) return json({ error: eligible.reason, verification: eligible.verification }, 403);
  let body: Record<string, unknown>;
  try { body = await readCommandObject(request, 1024); } catch { return json({ error: 'Expected a bounded town hall command.' }, 400); }
  if ((body.action !== 'ask' && body.action !== 'vote') || !validPetitionId(body.requestId)) return json({ error: 'Use a valid action and request id.' }, 400);
  const now = Math.floor(Date.now() / 1000), openAt = townHallOpenAt(bindings());
  const result = body.action === 'ask'
    ? await askQuestion(db, userId, now, openAt, { candidateId: body.candidateId, requestId: body.requestId, text: body.text })
    : await voteQuestion(db, userId, now, { questionId: body.questionId, requestId: body.requestId });
  if (!result.ok) return json({ error: result.error }, result.status);
  return json({ ok: true, alreadyRecorded: result.alreadyRecorded, ...await readTownHalls(db, userId, now, openAt), eligibility: eligible });
}
