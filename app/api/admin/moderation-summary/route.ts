import { env } from 'cloudflare:workers';
import { getDatabase } from '@/lib/db';
import { bearerMatches } from '@/lib/war-authority'; // same constant-time bearer check as the other admin routes
import { parseModerationSummaryWindow, readModerationSummary } from '@/lib/moderation-summary';

export const dynamic = 'force-dynamic';
const privateJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

// #1524: staff counts for a UTC date window (docs §21.3). Same gate as GET /api/admin/reports.
// Flag HARIMU_REPORTS_ENABLED off or HARIMU_ADMIN_TOKEN unset/short = 404; wrong bearer = 401. Read-only. No new flag.
export async function GET(request: Request) {
  const bindings = env as unknown as { HARIMU_REPORTS_ENABLED?: string; HARIMU_ADMIN_TOKEN?: string; HARIMU_AI_REVIEW_QUEUE_ENABLED?: string; HARIMU_KILL_SWITCH_EVENTS_ENABLED?: string };
  if (bindings.HARIMU_REPORTS_ENABLED !== 'true' || typeof bindings.HARIMU_ADMIN_TOKEN !== 'string' || bindings.HARIMU_ADMIN_TOKEN.length < 16) return privateJson({ error: 'Not found.' }, 404);
  if (!(await bearerMatches(request.headers.get('Authorization'), bindings.HARIMU_ADMIN_TOKEN))) return privateJson({ error: 'A server credential is required.' }, 401);
  const params = new URL(request.url).searchParams;
  const window = parseModerationSummaryWindow(params.get('from'), params.get('to'));
  if (!window.ok) return privateJson({ error: window.error }, 400);
  try { return privateJson(await readModerationSummary(await getDatabase(), { from: window.from, to: window.to, env: bindings })); }
  catch { return privateJson({ error: 'The moderation summary is unavailable.' }, 500); }
}
