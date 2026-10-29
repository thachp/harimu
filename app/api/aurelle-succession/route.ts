import { env } from 'cloudflare:workers';
import { getDatabase } from '@/lib/db';
import { readCommandObject } from '@/lib/command-request';
import { bearerMatches } from '@/lib/war-authority';
import { handleSuccessionCommand } from '@/lib/aurelle-succession';
import { flagOn } from '@/lib/flag-pack.mjs'; // #988

export const dynamic = 'force-dynamic';
const privateJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

// #613: operator/QA succession command behind HARIMU_AURELLE_SUCCESSION_ENABLED (default "false") and HARIMU_AURELLE_SUCCESSION_ADMIN_SECRET (a Worker secret set in the dashboard, never in the repo; unset fails closed).
// No citizen session and no GET: the state is read through the government snapshot, which is read-only. Flag off: 404 before anything is read. Credential before the body: no credential is 401, never 400.
export async function POST(request: Request) {
  const bindings = env as unknown as { HARIMU_AURELLE_SUCCESSION_ADMIN_SECRET?: string };
  if (!flagOn(env, 'HARIMU_AURELLE_SUCCESSION_ENABLED')) return privateJson({ error: 'Not found.', reason: 'disabled' }, 404);
  const authorization = request.headers.get('Authorization');
  if (!(await bearerMatches(authorization, bindings.HARIMU_AURELLE_SUCCESSION_ADMIN_SECRET))) return privateJson({ error: 'A server credential is required.', reason: 'unauthorized' }, 401);
  let body: Record<string, unknown>;
  try { body = await readCommandObject(request, 512); } catch { return privateJson({ error: 'Send a succession command.', reason: 'bad_request' }, 400); }
  const result = await handleSuccessionCommand(await getDatabase(), { enabled: true, secret: bindings.HARIMU_AURELLE_SUCCESSION_ADMIN_SECRET, authorization, body, now: Math.floor(Date.now() / 1000) });
  return result.ok ? privateJson(result) : privateJson({ error: result.error, reason: result.reason }, result.status);
}
