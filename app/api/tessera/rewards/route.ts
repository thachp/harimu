import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { isSameOriginCommand, readCommandObject } from '@/lib/command-request';
import { readVerification } from '@/lib/verification';
import { claimReward, parseClaimCommand, readRewardKiosk, tesseraRewardsEnabled, type RewardBindings } from '@/lib/tessera-rewards';

export const dynamic = 'force-dynamic';
const privateJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const bindings = () => env as unknown as RewardBindings;
const verify = async (userId: string) => (await readVerification(userId)).countedActionsEligible;

// #465: earned-Tessera reward kiosk (read) and claim (one entry per request). Flag HARIMU_TESSERA_REWARDS_ENABLED off (the shipped default) is a 404 before auth, validation, reads and writes.
export async function GET(request: Request) {
  if (!tesseraRewardsEnabled(bindings())) return privateJson({ error: 'Not found.', reason: 'disabled' }, 404);
  const userId = await authenticatedUserId(request);
  if (!userId) return privateJson({ error: 'Sign in required.' }, 401);
  return privateJson(await readRewardKiosk(await getDatabase(), userId));
}

export async function POST(request: Request) {
  if (!tesseraRewardsEnabled(bindings())) return privateJson({ error: 'Not found.', reason: 'disabled' }, 404);
  const userId = await authenticatedUserId(request);
  if (!userId) return privateJson({ error: 'Sign in required.' }, 401);
  if (!isSameOriginCommand(request)) return privateJson({ error: 'Same-origin request required.' }, 403);
  let body: Record<string, unknown>;
  try { body = await readCommandObject(request, 512); } catch { return privateJson({ error: 'Send a claim command.', reason: 'bad_request' }, 400); }
  const command = parseClaimCommand(body);
  if (!command) return privateJson({ error: 'Send action "claim" with an entryId and a valid requestId.', reason: 'bad_request' }, 400);
  const result = await claimReward(await getDatabase(), userId, command, Math.floor(Date.now() / 1000), verify);
  return result.ok ? privateJson(result) : privateJson({ error: result.error, reason: result.reason }, result.status);
}
