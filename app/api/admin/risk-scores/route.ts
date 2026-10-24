import { env } from 'cloudflare:workers';
import { getDatabase } from '@/lib/db';
import { bearerMatches } from '@/lib/war-authority'; // the same constant-time bearer check the other admin routes use
import { listRiskScores, riskScoringEnabled } from '@/lib/risk-scoring';

export const dynamic = 'force-dynamic';
const privateJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

// #879: staff list of integrity risk scores (docs §20). Human review only: the payload is a sort key, never a penalty.
// Flag HARIMU_RISK_SCORING_ENABLED off or HARIMU_ADMIN_TOKEN unset or shorter than 16 characters = 404 before any DB access; a wrong bearer = 401. Read-only.
export async function GET(request: Request) {
  const bindings = env as unknown as { HARIMU_RISK_SCORING_ENABLED?: string; HARIMU_ADMIN_TOKEN?: string };
  if (!riskScoringEnabled(bindings) || typeof bindings.HARIMU_ADMIN_TOKEN !== 'string' || bindings.HARIMU_ADMIN_TOKEN.length < 16) return privateJson({ error: 'Not found.' }, 404);
  if (!(await bearerMatches(request.headers.get('Authorization'), bindings.HARIMU_ADMIN_TOKEN))) return privateJson({ error: 'A server credential is required.' }, 401);
  try { return privateJson({ reviewOnly: true, accounts: await listRiskScores(await getDatabase()) }); }
  catch { return privateJson({ error: 'The risk scores are unavailable.' }, 500); }
}
