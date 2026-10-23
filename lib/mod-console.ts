/** #880: build-time flag NEXT_PUBLIC_HARIMU_MOD_CONSOLE ("true" in preview, "false" in production) for the staff mod console at /admin/mod.
 *  The console is a read-only client over existing admin JSON routes; it adds no server logic and no access: every request carries the staff member's own
 *  HARIMU_ADMIN_TOKEN as a Bearer header, and each route keeps its own flag and token check (404 when off, 401 without the token). The token stays in memory. */
export function modConsoleEnabled(value: string | undefined = process.env.NEXT_PUBLIC_HARIMU_MOD_CONSOLE): boolean { return value === 'true'; }

export type ReviewItem = { id: string; created_at: number; source: string; nation_id: string; persona: string; output_text: string; filter_result: string; filter_detail: string | null; reason: string; reviewed_at: number | null; reviewer_note: string | null };
export type QueueResult = { ok: true; items: ReviewItem[] } | { ok: false; status: number; error: string };

/** GET /api/admin/ai-review-queue with optional reason and nation filters (the route validates them). */
export async function loadReviewQueue(token: string, filters: { reason?: string; nation?: string }, fetchImpl: typeof fetch = fetch): Promise<QueueResult> {
  const params = new URLSearchParams(); if (filters.reason) params.set('reason', filters.reason); if (filters.nation) params.set('nation', filters.nation);
  try {
    const response = await fetchImpl(`/api/admin/ai-review-queue${params.size ? `?${params}` : ''}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    const body = await response.json().catch(() => ({})) as { items?: ReviewItem[]; error?: string };
    return response.ok && Array.isArray(body.items) ? { ok: true, items: body.items } : { ok: false, status: response.status, error: body.error ?? `HTTP ${response.status}` };
  } catch { return { ok: false, status: 0, error: 'Network error' }; }
}

/** Seconds since the epoch as a UTC timestamp (the routes store unix seconds). */
export const utc = (seconds: number | null) => seconds == null ? '' : new Date(seconds * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

/** #880 console copy by Content (staff-only, plain and literal; filter and column labels stay the route's own field names). `proposal: true`. */
export const modConsoleCopy = {
  proposal: true,
  title: 'Mod console', token: 'Admin token', load: 'Load queue', loading: 'Loading…',
  empty: 'The queue is empty.', noMatch: 'No entries match these filters',
  count: (n: number) => n === 1 ? '1 entry' : `${n} entries`,
  newest: (page: number) => ` · newest ${page} shown, older entries not shown`,
} as const;
/** The status line for an accepted response: an empty result says whether the filters or the queue is empty. */
export const queueStatus = (n: number, filtered: boolean, page: number) =>
  n === 0 ? (filtered ? modConsoleCopy.noMatch : modConsoleCopy.empty) : modConsoleCopy.count(n) + (n >= page ? modConsoleCopy.newest(page) : '');
