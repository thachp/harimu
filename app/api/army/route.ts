import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { isSameOriginCommand, readCommandObject } from '@/lib/command-request';
import { armiesEnabled, armyDrillsEnabled, parseArmyCommand } from '@/lib/army-rules';
import { readArmy, runArmyCommand } from '@/lib/army';

export const dynamic = 'force-dynamic';
const privateJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const notFound = () => privateJson({ error: 'Not found.', reason: 'not_found' }, 404);

// #738 slice 1: your nation's home-guard unit. HARIMU_ARMIES_ENABLED and HARIMU_WAR_ENABLED both "true", else 404 before auth or any DB access.
export async function GET(request: Request) {
  if (!armiesEnabled(env)) return notFound();
  const userId = await authenticatedUserId(request);
  if (!userId) return privateJson({ error: 'Sign in required.' }, 401);
  return privateJson({ army: await readArmy(await getDatabase(), userId, Math.floor(Date.now() / 1000), armyDrillsEnabled(env)) });
}

/** POST {action:'join', unitId} | {action:'leave'} | {action:'stance', stance}, each with a requestId (replay returns the current state, writes nothing). */
export async function POST(request: Request) {
  if (!armiesEnabled(env)) return notFound();
  const userId = await authenticatedUserId(request);
  if (!userId) return privateJson({ error: 'Sign in required.' }, 401);
  if (!isSameOriginCommand(request)) return privateJson({ error: 'Same-origin request required.' }, 403);
  let body: Record<string, unknown>;
  try { body = await readCommandObject(request, 1024); } catch { return privateJson({ error: 'Send an army command.', reason: 'bad_request' }, 400); }
  const command = parseArmyCommand(body);
  if (!command) return privateJson({ error: 'Send action join (unitId), leave or stance (hold, advance, fall_back) with a requestId.', reason: 'bad_request' }, 400);
  const result = await runArmyCommand(await getDatabase(), userId, command, Math.floor(Date.now() / 1000));
  return result.ok ? privateJson({ army: { unit: result.unit, member: result.member, stance: result.stance }, replayed: result.replayed }) : privateJson({ error: result.error, reason: result.reason }, result.status);
}
