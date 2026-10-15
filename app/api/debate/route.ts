import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { readVerification } from '@/lib/verification';
import { isSameOriginCommand, readCommandObject } from '@/lib/command-request';
import { validPetitionId } from '@/lib/collective-petitions';
import { accountElectionEnabled } from '@/lib/preview-election';
import { askDebateQuestion, debateOpenAt, debatesEnabled, readDebate, readDebateFigures, voteDebateQuestion, type DebateBindings } from '@/lib/debate';

export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const bindings = () => env as unknown as DebateBindings;

// #282: the Kindle presidential debate. Off unless HARIMU_DEBATE_ENABLED=true; while off both methods do nothing (no auth, no database).
// GET is read-only: no hall row is created and the AI is never called. The AI answers are written only by the scheduled Worker, never here.
// Questions and up-votes go through the town hall's own functions (lib/town-hall.ts).
async function kindleCitizen(userId: string) {
  const db = await getDatabase();
  return { db, kindle: (await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string | null }>())?.nation_id === 'kindle' };
}
/** The presidential ballot's eligibility: a verified human (Tier 1), or the approved account-level preview exception. */
async function eligibility(userId: string) {
  const verification = await readVerification(userId);
  if (accountElectionEnabled(bindings())) return { eligible: true, scope: 'preview-citizen', reason: 'Signed-in Kindle citizens may take part in this preview PoC.', verification };
  return { eligible: verification.countedActionsEligible, scope: 'tier1', reason: verification.reason, verification };
}

export async function GET(request: Request) {
  if (!debatesEnabled(bindings())) return json({ enabled: false }, 404);
  const userId = await authenticatedUserId(request);
  if (!userId) return json({ error: 'Sign in required.' }, 401);
  const { db, kindle } = await kindleCitizen(userId);
  if (!kindle) return json({ error: 'The debate is for Kindle citizens only.' }, 403);
  return json({ ...await readDebate(db, userId, Math.floor(Date.now() / 1000), debateOpenAt(bindings()), await readDebateFigures(db, bindings())), eligibility: await eligibility(userId) });
}

export async function POST(request: Request) {
  if (!isSameOriginCommand(request)) return json({ error: 'Same-origin request required.' }, 403);
  if (!debatesEnabled(bindings())) return json({ enabled: false }, 404);
  const userId = await authenticatedUserId(request);
  if (!userId) return json({ error: 'Sign in required.' }, 401);
  const { db, kindle } = await kindleCitizen(userId);
  if (!kindle) return json({ error: 'The debate is for Kindle citizens only.' }, 403);
  const eligible = await eligibility(userId);
  if (!eligible.eligible) return json({ error: eligible.reason, verification: eligible.verification }, 403);
  let body: Record<string, unknown>;
  try { body = await readCommandObject(request, 1024); } catch { return json({ error: 'Expected a bounded debate command.' }, 400); }
  if ((body.action !== 'ask' && body.action !== 'vote') || !validPetitionId(body.requestId)) return json({ error: 'Use a valid action and request id.' }, 400);
  const now = Math.floor(Date.now() / 1000), openAt = debateOpenAt(bindings());
  const result = body.action === 'ask'
    ? await askDebateQuestion(db, userId, now, openAt, { requestId: body.requestId, text: body.text })
    : await voteDebateQuestion(db, userId, now, { questionId: body.questionId, requestId: body.requestId });
  if (!result.ok) return json({ error: result.error }, result.status);
  return json({ ok: true, alreadyRecorded: result.alreadyRecorded, ...await readDebate(db, userId, now, openAt, await readDebateFigures(db, bindings())), eligibility: eligible });
}
