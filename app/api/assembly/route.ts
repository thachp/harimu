import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { readVerification } from '@/lib/verification';
import { isSameOriginCommand, readCommandObject } from '@/lib/command-request';
import { validPetitionId } from '@/lib/collective-petitions';
import { ballotPrivacyReason } from '@/lib/ballot-privacy';
import { assemblyBallotSql, assemblyEnabled, assemblyMarkWrittenSql, assemblyElectionIdFor, assemblyReceiptSql, assemblyScope, assemblyTiming, citizenDistrict, ensureAssemblyElection, finalizeAssembly, isParty, readAssembly, type AssemblyBindings } from '@/lib/assembly';

export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const bindings = () => env as unknown as AssemblyBindings;

// #283: Kindle mid-term Assembly. Off unless HARIMU_KINDLE_ASSEMBLY_ENABLED=true; while off both methods do nothing (no auth, no database).
// GET is read-only: no election row, close or count is written (the world tick and POST record those).
async function kindleCitizen(userId: string) {
  const db = await getDatabase();
  return { db, kindle: (await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string | null }>())?.nation_id === 'kindle' };
}
async function eligibility(scope: ReturnType<typeof assemblyScope>, userId: string) {
  const verification = await readVerification(userId);
  if (scope?.scope === 'preview-citizen') return { eligible: true, scope: 'preview-citizen', reason: 'Signed-in Kindle citizens may vote once in this preview PoC.', verification };
  return { eligible: verification.countedActionsEligible, scope: 'tier1', reason: verification.reason, verification };
}

export async function GET(request: Request) {
  if (!assemblyEnabled(bindings())) return json({ enabled: false }, 404);
  const userId = await authenticatedUserId(request);
  if (!userId) return json({ error: 'Sign in required.' }, 401);
  const { db, kindle } = await kindleCitizen(userId);
  if (!kindle) return json({ error: 'The Assembly election is for Kindle citizens only.' }, 403);
  const scope = assemblyScope(bindings());
  return json({ ...await readAssembly(db, userId, Math.floor(Date.now() / 1000), scope, assemblyTiming(bindings())), eligibility: await eligibility(scope, userId) });
}

export async function POST(request: Request) {
  if (!isSameOriginCommand(request)) return json({ error: 'Same-origin request required.' }, 403);
  if (!assemblyEnabled(bindings())) return json({ enabled: false }, 404);
  // While privacy is unreviewed (and no approved preview), refuse before authenticating or parsing a ballot.
  const scope = assemblyScope(bindings());
  if (!scope) return json({ error: ballotPrivacyReason, privacyReady: false }, 403);
  const userId = await authenticatedUserId(request);
  if (!userId) return json({ error: 'Sign in required.' }, 401);
  const { db, kindle } = await kindleCitizen(userId);
  if (!kindle) return json({ error: 'The Assembly election is for Kindle citizens only.' }, 403);
  const eligible = await eligibility(scope, userId);
  if (!eligible.eligible) return json({ error: eligible.reason, verification: eligible.verification }, 403);
  let body: Record<string, unknown>;
  try { body = await readCommandObject(request, 1024); } catch { return json({ error: 'Expected a bounded party-list ballot command.' }, 400); }
  if (body.action !== 'vote' || body.electionId !== assemblyElectionIdFor(scope, assemblyTiming(bindings()), Math.floor(Date.now() / 1000)) || !validPetitionId(body.requestId) || !isParty(body.partyId)) return json({ error: 'Pick exactly one party list and use a valid ballot receipt.' }, 400);
  const now = Math.floor(Date.now() / 1000), requestId = body.requestId, partyId = body.partyId, timing = assemblyTiming(bindings()), electionId = assemblyElectionIdFor(scope, timing, now);
  const receipt = () => db.prepare('SELECT election_id,clerk_user_id,ballot_written FROM assembly_voter_receipts WHERE request_id=?').bind(requestId).first<{ election_id: string; clerk_user_id: string; ballot_written: number }>();
  const snapshot = async (extra: Record<string, unknown>) => json({ ...extra, ...await readAssembly(db, userId, now, scope, timing), eligibility: eligible });
  const prior = await receipt();
  if (prior) {
    if (prior.election_id !== electionId || prior.clerk_user_id !== userId || Number(prior.ballot_written) !== 1) return json({ error: 'Ballot receipt already used.' }, 409);
    return snapshot({ ok: true, alreadyRecorded: true, message: 'Your original ballot remains recorded. This retry does not change it.' });
  }
  await ensureAssemblyElection(db, scope, timing, now);
  const district = await citizenDistrict(db, userId); // server-derived: the request cannot name a district
  await db.batch([
    db.prepare(assemblyReceiptSql).bind(district, requestId, now, userId, electionId, now, now),
    db.prepare(assemblyBallotSql).bind(crypto.randomUUID(), partyId, requestId, userId, electionId),
    db.prepare(assemblyMarkWrittenSql).bind(requestId, userId, electionId),
  ]);
  const saved = await receipt();
  if (!saved || saved.clerk_user_id !== userId || saved.election_id !== electionId || Number(saved.ballot_written) !== 1) return json({ error: 'Already voted, voting closed or not yet open, or citizenship changed. Refresh your ballot status.' }, 409);
  await finalizeAssembly(db, scope, now); // a no-op unless the window just closed
  return snapshot({ ok: true });
}
