import { env } from 'cloudflare:workers';
import { getDatabase } from '@/lib/db';
import { bearerMatches } from '@/lib/war-authority'; // the same constant-time bearer check the war admin routes use
import { readLatestReport, reconciliationConfig } from '@/lib/ledger-reconciliation';

export const dynamic = 'force-dynamic';
const privateJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

// #432: read-only admin view of the latest daily ledger reconciliation report. No citizen UI and no write path: this GET only reads the report row.
// Fail closed: flag off (HARIMU_LEDGER_RECONCILIATION_ENABLED, default "false") or HARIMU_ADMIN_TOKEN unset or shorter than 16 characters = 404, as if the route did not exist.
// With both set, a missing or wrong "Authorization: Bearer <token>" is 401 (same as the war admin helper in #429). The token is never logged or returned.
// The body is aggregates, mismatch counts and opaque account ids only: no names, no personal data.
export async function GET(request: Request) {
  const bindings = env as unknown as { HARIMU_LEDGER_RECONCILIATION_ENABLED?: string; HARIMU_ADMIN_TOKEN?: string };
  const configured = bindings.HARIMU_LEDGER_RECONCILIATION_ENABLED === 'true' && typeof bindings.HARIMU_ADMIN_TOKEN === 'string' && bindings.HARIMU_ADMIN_TOKEN.length >= reconciliationConfig.minAdminTokenLength;
  if (!configured) return privateJson({ error: 'Not found.' }, 404);
  if (!(await bearerMatches(request.headers.get('Authorization'), bindings.HARIMU_ADMIN_TOKEN))) return privateJson({ error: 'A server credential is required.' }, 401);
  return privateJson({ report: await readLatestReport(await getDatabase()) });
}
