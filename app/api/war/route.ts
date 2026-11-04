import { env } from 'cloudflare:workers';
import { getDatabase } from '@/lib/db';
import { readCommandObject } from '@/lib/command-request';
import { authorizeWarCaller, handleWarCommand } from '@/lib/war-actions';
import { peaceRevertEnabled } from '@/lib/war-peace-revert'; // #1054

export const dynamic = 'force-dynamic';
const privateJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

// #350: server-only war commands (declare, propose-end, accept-end) behind HARIMU_WAR_ENABLED (default "false"). No citizen session and no GET:
// the caller is an AI-leadership/admin server holding HARIMU_WAR_ADMIN_SECRET (a Worker secret set in the dashboard, never in the repo).
// Flag off: 403 before anything is read or written. Wars are read through the world snapshot, which is read-only.
export async function POST(request: Request) {
  const bindings = env as unknown as { HARIMU_WAR_ENABLED?: string; HARIMU_WAR_ADMIN_SECRET?: string; HARIMU_WAR_DECLARATION_LIMITS_ENABLED?: string; HARIMU_WAR_ASSEMBLY_ENABLED?: string; HARIMU_WAR_LOSS_CAP_ENABLED?: string; HARIMU_WAR_ENDINGS_ENABLED?: string };
  if (bindings.HARIMU_WAR_ENABLED !== 'true') return privateJson({ error: 'War is not open yet.', reason: 'disabled' }, 403);
  const authorization = request.headers.get('Authorization');
  // Credential before the body: a caller without it learns nothing about what a valid body looks like (401, never 400).
  const denied = await authorizeWarCaller({ enabled: true, secret: bindings.HARIMU_WAR_ADMIN_SECRET, authorization });
  if (denied) return privateJson({ error: denied.error, reason: denied.reason }, denied.status);
  let body: Record<string, unknown>;
  try { body = await readCommandObject(request, 2048); } catch { return privateJson({ error: 'Send a war command.', reason: 'bad_request' }, 400); }
  const result = await handleWarCommand(await getDatabase(), { enabled: true, limits: bindings.HARIMU_WAR_DECLARATION_LIMITS_ENABLED === 'true', assembly: bindings.HARIMU_WAR_ASSEMBLY_ENABLED === 'true', lossCap: bindings.HARIMU_WAR_LOSS_CAP_ENABLED === 'true', // #912
 endings: bindings.HARIMU_WAR_ENDINGS_ENABLED === 'true', peaceRevert: peaceRevertEnabled(env), secret: bindings.HARIMU_WAR_ADMIN_SECRET, authorization, body, now: Math.floor(Date.now() / 1000) });
  return result.ok ? privateJson(result) : privateJson({ error: result.error, reason: result.reason }, result.status);
}
