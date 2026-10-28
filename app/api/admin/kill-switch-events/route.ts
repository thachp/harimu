import { env } from 'cloudflare:workers';
import { getDatabase } from '@/lib/db';
import { bearerMatches } from '@/lib/war-authority'; // the same constant-time bearer check the other admin routes use
import { killSwitchEventsEnabled, listKillSwitchEvents } from '@/lib/kill-switch-events';

export const dynamic = 'force-dynamic';
const privateJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

// #764 slice 2: read-only staff list of AI kill-switch changes (docs §21.4). Same fail-closed pattern as #614/#879.
// Flag HARIMU_KILL_SWITCH_EVENTS_ENABLED off or HARIMU_ADMIN_TOKEN unset or shorter than 16 characters = 404 before any DB access; a wrong bearer = 401.
export async function GET(request: Request) {
  const bindings = env as unknown as { HARIMU_KILL_SWITCH_EVENTS_ENABLED?: string; HARIMU_ADMIN_TOKEN?: string };
  if (!killSwitchEventsEnabled(bindings) || typeof bindings.HARIMU_ADMIN_TOKEN !== 'string' || bindings.HARIMU_ADMIN_TOKEN.length < 16) return privateJson({ error: 'Not found.' }, 404);
  if (!(await bearerMatches(request.headers.get('Authorization'), bindings.HARIMU_ADMIN_TOKEN))) return privateJson({ error: 'A server credential is required.' }, 401);
  try { return privateJson({ events: await listKillSwitchEvents(await getDatabase()) }); }
  catch { return privateJson({ error: 'The kill-switch events are unavailable.' }, 500); }
}
