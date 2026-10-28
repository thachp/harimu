import { env } from 'cloudflare:workers';
import { getDatabase } from '@/lib/db';
import { bearerMatches } from '@/lib/war-authority'; // the same constant-time bearer check the AI cost and ledger admin routes use
import { aiReviewQueueEnabled, listAiReviewQueue, markAiReviewed } from '@/lib/ai-review-queue';

export const dynamic = 'force-dynamic';
const privateJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const nations = new Set(['kindle', 'korund', 'aurelle']), reasons = new Set(['flagged', 'sample']);

// #753 / #959: staff AI review queue. Flag off or token unset/short = 404; wrong bearer = 401. #959 adds limit/offset paging; mark-reviewed is idempotent.
async function authorized(request: Request): Promise<Response | null> {
  const bindings = env as unknown as { HARIMU_AI_REVIEW_QUEUE_ENABLED?: string; HARIMU_ADMIN_TOKEN?: string };
  const configured = aiReviewQueueEnabled(bindings) && typeof bindings.HARIMU_ADMIN_TOKEN === 'string' && bindings.HARIMU_ADMIN_TOKEN.length >= 16;
  if (!configured) return privateJson({ error: 'Not found.' }, 404);
  if (!(await bearerMatches(request.headers.get('Authorization'), bindings.HARIMU_ADMIN_TOKEN))) return privateJson({ error: 'A server credential is required.' }, 401);
  return null;
}

const page = (raw: string | null, fallback: number, max: number) => {
  if (raw == null || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) return null;
  return Math.min(Math.max(0, Number(raw)), max);
};

/** GET ?reason=&nation=&limit=&offset=: newest first. limit 1–200 (default 50), offset ≥ 0. */
export async function GET(request: Request) {
  const refused = await authorized(request); if (refused) return refused;
  const params = new URL(request.url).searchParams, reason = params.get('reason'), nation = params.get('nation');
  if ((reason && !reasons.has(reason)) || (nation && !nations.has(nation))) return privateJson({ error: 'Unknown reason or nation filter.' }, 400);
  const limit = page(params.get('limit'), 50, 200), offset = page(params.get('offset'), 0, 100_000);
  if (limit == null || offset == null || limit < 1) return privateJson({ error: 'limit and offset must be non-negative integers (limit at least 1).' }, 400);
  try { return privateJson({ items: await listAiReviewQueue(await getDatabase(), { reason, nation, limit, offset }) }); }
  catch { return privateJson({ error: 'The review queue is unavailable.' }, 500); }
}

/** POST {id, note}: mark one entry reviewed. Idempotent (#959): a second mark returns reviewed:true without changing the first note; unknown id is 409. */
export async function POST(request: Request) {
  const refused = await authorized(request); if (refused) return refused;
  let body: unknown; try { body = await request.json(); } catch { return privateJson({ error: 'Send JSON with id and note.' }, 400); }
  const { id, note } = (body ?? {}) as { id?: unknown; note?: unknown };
  if (typeof id !== 'string' || id.length < 1 || id.length > 200 || typeof note !== 'string' || note.trim().length < 1 || note.length > 500) return privateJson({ error: 'Send an id and a note of 1-500 characters.' }, 400);
  try {
    const marked = await markAiReviewed(await getDatabase(), id, note.trim(), Math.floor(Date.now() / 1000));
    return marked ? privateJson({ id, reviewed: true }) : privateJson({ error: 'Unknown review queue entry.' }, 409);
  } catch { return privateJson({ error: 'The review queue is unavailable.' }, 500); }
}
