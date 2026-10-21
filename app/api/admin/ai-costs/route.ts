import { env } from 'cloudflare:workers';
import { getDatabase } from '@/lib/db';
import { bearerMatches } from '@/lib/war-authority'; // the same constant-time bearer check the ledger and war admin routes use
import { aiBudgetConfig } from '@/lib/ai-budget';
import { readAiCosts } from '@/lib/ai-costs';

export const dynamic = 'force-dynamic';
const privateJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

// #614: read-only admin AI cost dashboard (JSON only), the same pattern as the ledger reconciliation admin route (#432).
// Fail closed: flag off (HARIMU_AI_COST_DASHBOARD_ENABLED, "false" in preview and production) or HARIMU_ADMIN_TOKEN unset or shorter than 16 characters = 404,
// before any DB access. With both set, a missing or wrong "Authorization: Bearer <token>" is 401. The token is never logged or returned.
export async function GET(request: Request) {
  const bindings = env as unknown as { HARIMU_AI_COST_DASHBOARD_ENABLED?: string; HARIMU_ADMIN_TOKEN?: string; HARIMU_AI_DAILY_BUDGET_MICRO?: string; HARIMU_AI_GATEWAY_ID?: string };
  const configured = bindings.HARIMU_AI_COST_DASHBOARD_ENABLED === 'true' && typeof bindings.HARIMU_ADMIN_TOKEN === 'string' && bindings.HARIMU_ADMIN_TOKEN.length >= 16;
  if (!configured) return privateJson({ error: 'Not found.' }, 404);
  if (!(await bearerMatches(request.headers.get('Authorization'), bindings.HARIMU_ADMIN_TOKEN))) return privateJson({ error: 'A server credential is required.' }, 401);
  const now = Math.floor(Date.now() / 1000);
  try {
    return privateJson(await readAiCosts(await getDatabase(), now, aiBudgetConfig(bindings, now)?.dailyBudgetMicro ?? null));
  } catch { // a failed read is an explicit 500, never 200 with $0 (no error detail leaves the server)
    return privateJson({ error: 'AI cost data is unavailable.' }, 500);
  }
}
