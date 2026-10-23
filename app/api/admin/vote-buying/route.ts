import { env } from 'cloudflare:workers';
import { getDatabase } from '@/lib/db';
import { bearerMatches } from '@/lib/war-authority'; // the same constant-time bearer check the other admin routes use
import { listVoteBuyingEvents, voteBuyingWatchEnabled } from '@/lib/vote-buying-watch';

export const dynamic = 'force-dynamic';
const privateJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

// #825: staff list of vote-buying investigation events (docs §9.5), the same fail-closed admin pattern as #614/#753.
// Flag HARIMU_VOTE_BUYING_WATCH_ENABLED off or HARIMU_ADMIN_TOKEN unset or shorter than 16 characters = 404 before any DB access; a wrong bearer = 401. Read-only.
export async function GET(request: Request) {
  const bindings = env as unknown as { HARIMU_VOTE_BUYING_WATCH_ENABLED?: string; HARIMU_ADMIN_TOKEN?: string };
  if (!voteBuyingWatchEnabled(bindings) || typeof bindings.HARIMU_ADMIN_TOKEN !== 'string' || bindings.HARIMU_ADMIN_TOKEN.length < 16) return privateJson({ error: 'Not found.' }, 404);
  if (!(await bearerMatches(request.headers.get('Authorization'), bindings.HARIMU_ADMIN_TOKEN))) return privateJson({ error: 'A server credential is required.' }, 401);
  try { return privateJson({ events: await listVoteBuyingEvents(await getDatabase()) }); }
  catch { return privateJson({ error: 'The vote-buying watch is unavailable.' }, 500); }
}
