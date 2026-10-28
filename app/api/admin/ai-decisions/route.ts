import { env } from 'cloudflare:workers';
import { getDatabase } from '@/lib/db';
import { bearerMatches } from '@/lib/war-authority'; // same constant-time bearer check as the other admin routes
import { aiReviewQueueEnabled, listAiDecisions } from '@/lib/ai-review-queue';

export const dynamic = 'force-dynamic';
const privateJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const nations = new Set(['kindle', 'korund', 'aurelle']), reasons = new Set(['flagged', 'sample']);

// #959: staff read of AI decision records (reviewed review-queue rows; docs §21.4 logging). Human review only.
// Same flag/token gate as /api/admin/ai-review-queue. Read-only.
export async function GET(request: Request) {
  const bindings = env as unknown as { HARIMU_AI_REVIEW_QUEUE_ENABLED?: string; HARIMU_ADMIN_TOKEN?: string };
  if (!aiReviewQueueEnabled(bindings) || typeof bindings.HARIMU_ADMIN_TOKEN !== 'string' || bindings.HARIMU_ADMIN_TOKEN.length < 16) return privateJson({ error: 'Not found.' }, 404);
  if (!(await bearerMatches(request.headers.get('Authorization'), bindings.HARIMU_ADMIN_TOKEN))) return privateJson({ error: 'A server credential is required.' }, 401);
  const params = new URL(request.url).searchParams, reason = params.get('reason'), nation = params.get('nation');
  if ((reason && !reasons.has(reason)) || (nation && !nations.has(nation))) return privateJson({ error: 'Unknown reason or nation filter.' }, 400);
  const limRaw = params.get('limit'), offRaw = params.get('offset');
  if ((limRaw != null && limRaw !== '' && !/^\d+$/.test(limRaw)) || (offRaw != null && offRaw !== '' && !/^\d+$/.test(offRaw))) return privateJson({ error: 'limit and offset must be non-negative integers.' }, 400);
  const limit = Math.min(Math.max(1, limRaw ? Number(limRaw) : 50), 200), offset = Math.max(0, offRaw ? Number(offRaw) : 0);
  if (limRaw != null && limRaw !== '' && Number(limRaw) < 1) return privateJson({ error: 'limit must be at least 1.' }, 400);
  try { return privateJson({ decisions: await listAiDecisions(await getDatabase(), { reason, nation, limit, offset }) }); }
  catch { return privateJson({ error: 'The AI decision records are unavailable.' }, 500); }
}
