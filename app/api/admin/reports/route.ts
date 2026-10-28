import { env } from 'cloudflare:workers';
import { getDatabase } from '@/lib/db';
import { bearerMatches } from '@/lib/war-authority'; // same constant-time bearer check as the other admin routes
import { listModerationReports } from '@/lib/reports';

export const dynamic = 'force-dynamic';
const privateJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

// #959: staff list of player moderation reports (docs §21.3). Human review only.
// Flag HARIMU_REPORTS_ENABLED off or HARIMU_ADMIN_TOKEN unset/short = 404; wrong bearer = 401. Read-only.
export async function GET(request: Request) {
  const bindings = env as unknown as { HARIMU_REPORTS_ENABLED?: string; HARIMU_ADMIN_TOKEN?: string };
  if (bindings.HARIMU_REPORTS_ENABLED !== 'true' || typeof bindings.HARIMU_ADMIN_TOKEN !== 'string' || bindings.HARIMU_ADMIN_TOKEN.length < 16) return privateJson({ error: 'Not found.' }, 404);
  if (!(await bearerMatches(request.headers.get('Authorization'), bindings.HARIMU_ADMIN_TOKEN))) return privateJson({ error: 'A server credential is required.' }, 401);
  const params = new URL(request.url).searchParams;
  const limRaw = params.get('limit'), offRaw = params.get('offset');
  if ((limRaw != null && limRaw !== '' && !/^\d+$/.test(limRaw)) || (offRaw != null && offRaw !== '' && !/^\d+$/.test(offRaw))) return privateJson({ error: 'limit and offset must be non-negative integers.' }, 400);
  const limit = Math.min(Math.max(1, limRaw ? Number(limRaw) : 50), 200), offset = Math.max(0, offRaw ? Number(offRaw) : 0);
  if (limRaw != null && limRaw !== '' && Number(limRaw) < 1) return privateJson({ error: 'limit must be at least 1.' }, 400);
  try { return privateJson({ reports: await listModerationReports(await getDatabase(), { limit, offset }) }); }
  catch { return privateJson({ error: 'The reports list is unavailable.' }, 500); }
}
