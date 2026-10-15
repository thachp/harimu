import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { readVerification } from '@/lib/verification';
import { kindleEligibility } from '@/lib/kindle-eligibility';
import { isSameOriginCommand, readCommandObject } from '@/lib/command-request';
import { validPetitionId } from '@/lib/collective-petitions';
import { ballotPrivacyReason } from '@/lib/ballot-privacy';
import { validRanking } from '@/lib/instant-runoff';
import { ensurePrimary, finalizePrimary, hopefulIdsOf, isPartyId, joinPartySql, leavePartySql, memberParty, primariesEnabled, primaryBallotSql, primaryMarkWrittenSql, primaryOpenAt, primaryReceiptSql, primaryScope, readPrimaries, type PrimaryBindings } from '@/lib/primaries';

export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const bindings = () => env as unknown as PrimaryBindings;

// #307: Kindle party membership and human primaries. Off unless HARIMU_PRIMARIES_ENABLED=true; while off both methods do nothing (no auth, no database).
// GET is read-only: no election row, close or count is written (the world tick and POST record those).
async function kindleCitizen(userId: string) {
  const db = await getDatabase();
  return { db, kindle: (await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string | null }>())?.nation_id === 'kindle' };
}
async function eligibility(scope: ReturnType<typeof primaryScope>, userId: string) {
  return kindleEligibility(await readVerification(userId), { on: scope?.scope === 'preview-citizen', reason: 'Signed-in Kindle party members may vote once in this preview PoC.' });
}

export async function GET(request: Request) {
  if (!primariesEnabled(bindings())) return json({ enabled: false }, 404);
  const userId = await authenticatedUserId(request);
  if (!userId) return json({ error: 'Sign in required.' }, 401);
  const { db, kindle } = await kindleCitizen(userId);
  if (!kindle) return json({ error: 'Party primaries are for Kindle citizens only.' }, 403);
  const scope = primaryScope(bindings());
  return json({ ...await readPrimaries(db, userId, Math.floor(Date.now() / 1000), scope, primaryOpenAt(bindings())), eligibility: await eligibility(scope, userId) });
}

export async function POST(request: Request) {
  if (!isSameOriginCommand(request)) return json({ error: 'Same-origin request required.' }, 403);
  if (!primariesEnabled(bindings())) return json({ enabled: false }, 404);
  const userId = await authenticatedUserId(request);
  if (!userId) return json({ error: 'Sign in required.' }, 401);
  const { db, kindle } = await kindleCitizen(userId);
  if (!kindle) return json({ error: 'Party primaries are for Kindle citizens only.' }, 403);
  let body: Record<string, unknown>;
  try { body = await readCommandObject(request, 1024); } catch { return json({ error: 'Expected a bounded party command.' }, 400); }
  const scope = primaryScope(bindings()), openAt = primaryOpenAt(bindings()), now = Math.floor(Date.now() / 1000);
  const eligible = await eligibility(scope, userId);
  const reply = async (extra: Record<string, unknown>) => json({ ...extra, ...await readPrimaries(db, userId, now, scope, openAt), eligibility: eligible });

  if (body.action === 'join' || body.action === 'leave') {
    if (body.action === 'join' && !isPartyId(body.partyId)) return json({ error: 'Pick one of the three parties.' }, 400);
    if (scope) await ensurePrimary(db, scope, openAt, now); // so a window that is due to open freezes membership first
    const before = await memberParty(db, userId);
    if (body.action === 'join') await db.prepare(joinPartySql).bind(body.partyId, now, userId, now, now).run();
    else await db.prepare(leavePartySql).bind(userId, now, now).run();
    const after = await memberParty(db, userId);
    const wanted = body.action === 'join' ? body.partyId : null;
    if (after !== wanted) return json({ error: 'Party membership is frozen while a primary is open.' }, 409);
    return reply({ ok: true, changed: before !== after });
  }

  if (body.action !== 'vote') return json({ error: 'Send join, leave or vote.' }, 400);
  // While privacy is unreviewed (and no approved preview), refuse ballots before parsing them.
  if (!scope) return json({ error: ballotPrivacyReason, privacyReady: false }, 403);
  if (!eligible.eligible) return json({ error: eligible.reason, verification: eligible.verification }, 403);
  const party = await memberParty(db, userId);
  if (!party) return json({ error: 'Only party members can vote in a primary. Join a party first.' }, 403);
  // The party is the caller's own membership; a ballot ranks all of that party's hopefuls, once each, and nobody else's.
  if (body.electionId !== scope.id || !validPetitionId(body.requestId) || !validRanking(body.ranking, hopefulIdsOf(party))) return json({ error: "Rank all of your own party's hopefuls exactly once and use a valid ballot receipt." }, 400);
  const requestId = body.requestId, ranking = body.ranking;
  const receipt = () => db.prepare('SELECT election_id,clerk_user_id,ballot_written FROM primary_voter_receipts WHERE request_id=?').bind(requestId).first<{ election_id: string; clerk_user_id: string; ballot_written: number }>();
  const prior = await receipt();
  if (prior) {
    if (prior.election_id !== scope.id || prior.clerk_user_id !== userId || Number(prior.ballot_written) !== 1) return json({ error: 'Ballot receipt already used.' }, 409);
    return reply({ ok: true, alreadyRecorded: true, message: 'Your original ballot remains recorded. This retry does not change it.' });
  }
  await ensurePrimary(db, scope, openAt, now);
  await db.batch([
    db.prepare(primaryReceiptSql).bind(requestId, now, userId, scope.id, now, now),
    db.prepare(primaryBallotSql).bind(crypto.randomUUID(), JSON.stringify(ranking), requestId, userId, scope.id),
    db.prepare(primaryMarkWrittenSql).bind(requestId, userId, scope.id),
  ]);
  const saved = await receipt();
  if (!saved || saved.clerk_user_id !== userId || saved.election_id !== scope.id || Number(saved.ballot_written) !== 1) return json({ error: 'Already voted, voting closed or not yet open, or you left your party. Refresh your ballot status.' }, 409);
  await finalizePrimary(db, scope, now); // a no-op unless the window just closed
  return reply({ ok: true });
}
