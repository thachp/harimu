import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { activeIncomeTaxPercent } from '@/lib/income-tax';
import { kindleBudgetViewEnabled, readKindleBudget } from '@/lib/kindle-budget';

// #789: read-only Kindle national budget. Flag off: 404 before auth or any database read. GET only; it never writes. Kindle citizens only (403 otherwise).
export const dynamic = 'force-dynamic';
const privateJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
type Env = { HARIMU_KINDLE_BUDGET_VIEW_ENABLED?: string; HARIMU_KINDLE_INCOME_TAX_ENABLED?: string };
export async function GET(request: Request) {
  const e = env as unknown as Env;
  if (!kindleBudgetViewEnabled(e)) return privateJson({ error: 'Not found.', reason: 'not_found' }, 404);
  const userId = await authenticatedUserId(request);
  if (!userId) return privateJson({ error: 'Sign in required.' }, 401);
  const db = await getDatabase();
  const citizen = await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string | null }>();
  if (citizen?.nation_id !== 'kindle') return privateJson({ error: 'The Kindle budget is shown to Kindle citizens.' }, 403);
  return privateJson({ budget: await readKindleBudget(db, Math.floor(Date.now() / 1000), activeIncomeTaxPercent(e.HARIMU_KINDLE_INCOME_TAX_ENABLED)) });
}
