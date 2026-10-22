import { env } from 'cloudflare:workers';
import { getDatabase } from '@/lib/db';
import { bearerMatches } from '@/lib/war-authority'; // the same constant-time bearer check the AI cost and ledger admin routes use
import { aiReviewQueueEnabled, listAiReviewQueue, markAiReviewed } from '@/lib/ai-review-queue';

export const dynamic = 'force-dynamic';
const privateJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const nations = new Set(['kindle', 'korund', 'aurelle']), reasons = new Set(['flagged', 'sample']);

// #753: staff AI review queue, the same fail-closed admin pattern as the AI cost dashboard (#614).
// Flag HARIMU_AI_REVIEW_QUEUE_ENABLED off or HARIMU_ADMIN_TOKEN unset or shorter than 16 characters = 404 before any DB access;
// a missing or wrong "Authorization: Bearer <token>" = 401. The token is never logged or returned.
async function authorized(request: Request): Promise<Response | null> {
  const bindings = env as unknown as { HARIMU_AI_REVIEW_QUEUE_ENABLED?: string; HARIMU_ADMIN_TOKEN?: string };
  const configured = aiReviewQueueEnabled(bindings) && typeof bindings.HARIMU_ADMIN_TOKEN === 'string' && bindings.HARIMU_ADMIN_TOKEN.length >= 16;
  if (!configured) return privateJson({ error: 'Not found.' }, 404);
  if (!(await bearerMatches(request.headers.get('Authorization'), bindings.HARIMU_ADMIN_TOKEN))) return privateJson({ error: 'A server credential is required.' }, 401);
  return null;
}

/** GET ?reason=flagged|sample&nation=kindle|korund|aurelle: newest first. */
export async function GET(request: Request) {
  const refused = await authorized(request); if (refused) return refused;
  const params = new URL(request.url).searchParams, reason = params.get('reason'), nation = params.get('nation');
  if ((reason && !reasons.has(reason)) || (nation && !nations.has(nation))) return privateJson({ error: 'Unknown reason or nation filter.' }, 400);
  try { return privateJson({ items: await listAiReviewQueue(await getDatabase(), { reason, nation }) }); }
  catch { return privateJson({ error: 'The review queue is unavailable.' }, 500); }
}

/** POST {id, note}: mark one entry reviewed. The first review wins; a second is 409. */
export async function POST(request: Request) {
  const refused = await authorized(request); if (refused) return refused;
  let body: unknown; try { body = await request.json(); } catch { return privateJson({ error: 'Send JSON with id and note.' }, 400); }
  const { id, note } = (body ?? {}) as { id?: unknown; note?: unknown };
  if (typeof id !== 'string' || id.length < 1 || id.length > 200 || typeof note !== 'string' || note.trim().length < 1 || note.length > 500) return privateJson({ error: 'Send an id and a note of 1-500 characters.' }, 400);
  try {
    const marked = await markAiReviewed(await getDatabase(), id, note.trim(), Math.floor(Date.now() / 1000));
    return marked ? privateJson({ id, reviewed: true }) : privateJson({ error: 'Unknown or already reviewed entry.' }, 409);
  } catch { return privateJson({ error: 'The review queue is unavailable.' }, 500); }
}
