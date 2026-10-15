import { env } from 'cloudflare:workers';
import { wearinessEnabled, type WearinessBindings } from '@/lib/war-weariness'; // #423
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { isSameOriginCommand, readCommandObject } from '@/lib/command-request';
import { readVerification } from '@/lib/verification';
import { recordVerifiedHumanVisit } from '@/lib/collective-petitions';
import { advanceWorld } from '@/lib/world-simulation';
import { pledge, readAurelleRising, validPledgeCommand } from '@/lib/aurelle-rising';
import { readCoupView } from '@/lib/aurelle-coup';

export const dynamic = 'force-dynamic';
const privateJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const enabled = () => (env as unknown as { HARIMU_AURELLE_RISING_ENABLED?: string }).HARIMU_AURELLE_RISING_ENABLED === 'true';
const coupOn = () => (env as unknown as { HARIMU_AURELLE_COUP_ENABLED?: string }).HARIMU_AURELLE_COUP_ENABLED === 'true'; // #281
const faithOn = () => (env as unknown as { HARIMU_FAITH_ENABLED?: string }).HARIMU_FAITH_ENABLED === 'true'; // #291
const orderBook = () => (env as unknown as { HARIMU_ORDER_BOOK_ENABLED?: string }).HARIMU_ORDER_BOOK_ENABLED === 'true';

// #71: Aurelle claimants, private pledges and the popular Rising. Off unless HARIMU_AURELLE_RISING_ENABLED=true.
// GET is read-only (#205): no world tick, no writes. Pledge counts leave the server only as per-claimant aggregates.
export async function GET(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return privateJson({ error: 'Sign in required.' }, 401);
  const verification = await readVerification(userId);
  const db = await getDatabase();
  const state = await readAurelleRising(db, userId, Math.floor(Date.now() / 1000), { tier1: verification.countedActionsEligible, reason: verification.reason }, enabled());
  // #281: the public palace-coup window only (never plot internals); absent entirely while the coup flag is off.
  return privateJson(coupOn() ? { ...state, coup: await readCoupView(db) } : state);
}

export async function POST(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return privateJson({ error: 'Sign in required.' }, 401);
  if (!isSameOriginCommand(request)) return privateJson({ error: 'Same-origin request required.' }, 403);
  if (!enabled()) return privateJson({ error: 'Pledges to Aurelle claimants are not open yet.', reason: 'closed' }, 403);
  let body: Record<string, unknown>;
  try { body = await readCommandObject(request, 512); } catch { return privateJson({ error: 'Send a pledge command.', reason: 'bad_request' }, 400); }
  if (!validPledgeCommand(body)) return privateJson({ error: 'Send action aurelle-pledge with a requestId (UUID) and a claimantId.', reason: 'bad_request' }, 400);
  const verification = await readVerification(userId);
  if (!verification.countedActionsEligible) return privateJson({ error: `Only Tier-1 verified citizens can pledge. ${verification.reason}`, verification }, 403);
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);
  await advanceWorld(db, undefined, { npcSupply: orderBook(), aurelleRising: true, aurelleCoup: coupOn(), faithFestivals: faithOn(), warWeariness: wearinessEnabled(env as unknown as WearinessBindings) });
  await recordVerifiedHumanVisit(db, userId, now, { aurelleRising: true }); // flag checked above
  const result = await pledge(db, userId, { requestId: body.requestId.toLowerCase(), claimantId: body.claimantId }, now);
  const state = await readAurelleRising(db, userId, now, { tier1: true, reason: verification.reason }, true);
  return privateJson({ ...result, ok: result.status === 200, ...state }, result.status);
}
