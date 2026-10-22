import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { isSameOriginCommand, readCommandObject } from '@/lib/command-request';
import { claimTestFaucet, readTestFaucet, testFaucetLabel, type TestFaucetBindings } from '@/lib/test-faucet';

export const dynamic = 'force-dynamic';
const privateJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const bindings = () => env as unknown as TestFaucetBindings;

// #631: preview-only Tessera TEST faucet (flag HARIMU_TEST_FAUCET_ENABLED plus the preview marker; production gets a 404). Every answer says test: true.
export async function GET(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return privateJson({ error: 'Sign in required.', test: true, label: testFaucetLabel }, 401);
  return privateJson(await readTestFaucet(await getDatabase(), userId, bindings()));
}

export async function POST(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return privateJson({ error: 'Sign in required.', test: true, label: testFaucetLabel }, 401);
  if (!isSameOriginCommand(request)) return privateJson({ error: 'Same-origin request required.', test: true, label: testFaucetLabel }, 403);
  let body: Record<string, unknown>;
  try { body = await readCommandObject(request, 256); } catch { return privateJson({ error: 'Send action "claim".', reason: 'bad_request', test: true, label: testFaucetLabel }, 400); }
  if (body.action !== 'claim') return privateJson({ error: 'Send action "claim".', reason: 'bad_request', test: true, label: testFaucetLabel }, 400);
  const result = await claimTestFaucet(await getDatabase(), userId, Math.floor(Date.now() / 1000), bindings());
  return result.ok ? privateJson(result) : privateJson({ error: result.error, reason: result.reason, test: true, label: result.label }, result.status);
}
