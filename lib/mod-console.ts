/** #880: build-time flag NEXT_PUBLIC_HARIMU_MOD_CONSOLE ("true" in preview, "false" in production) for the staff mod console at /admin/mod.
 *  The console is a read-only client over existing admin JSON routes; it adds no server logic and no access: every request carries the staff member's own
 *  HARIMU_ADMIN_TOKEN as a Bearer header, and each route keeps its own flag and token check (404 when off, 401 without the token). The token stays in memory. */
export function modConsoleEnabled(value: string | undefined = process.env.NEXT_PUBLIC_HARIMU_MOD_CONSOLE): boolean { return value === 'true'; }

/** The four admin GETs this console reads; labels are the route path segments (no new marketing copy). */
export const modPanels = ['ai-review-queue', 'ai-costs', 'ledger-reconciliation', 'vote-buying'] as const;
export type ModPanel = (typeof modPanels)[number];

export type ReviewItem = { id: string; created_at: number; source: string; nation_id: string; persona: string; output_text: string; filter_result: string; filter_detail: string | null; reason: string; reviewed_at: number | null; reviewer_note: string | null };
export type CostDay = { day: string; reservedMicro: number; settledMicro: number; calls: number; budgetMicro: number | null };
export type LedgerReport = { gameDay: number; reconciledAt: number; mismatchCount: number } | null;
export type VoteEvent = { electionKey: string; voterId: string; senderId: string; transferId: string; reason: string; createdAt: number };
export type PanelResult =
  | { panel: 'ai-review-queue'; ok: true; items: ReviewItem[] }
  | { panel: 'ai-costs'; ok: true; days: CostDay[]; asOf: number; windowDays: number }
  | { panel: 'ledger-reconciliation'; ok: true; report: LedgerReport }
  | { panel: 'vote-buying'; ok: true; events: VoteEvent[] }
  | { panel: ModPanel; ok: false; status: number; error: string };

const auth = (token: string) => ({ Authorization: `Bearer ${token}` } as const);
async function getJson(path: string, token: string, fetchImpl: typeof fetch) {
  try {
    const response = await fetchImpl(path, { headers: auth(token), cache: 'no-store' });
    const body = await response.json().catch(() => ({})) as Record<string, unknown> & { error?: string };
    return { response, body };
  } catch { return { response: null, body: { error: 'Network error' } as { error: string } }; }
}

/** GET /api/admin/ai-review-queue with optional reason and nation filters (the route validates them). */
export async function loadReviewQueue(token: string, filters: { reason?: string; nation?: string }, fetchImpl: typeof fetch = fetch): Promise<PanelResult> {
  const params = new URLSearchParams(); if (filters.reason) params.set('reason', filters.reason); if (filters.nation) params.set('nation', filters.nation);
  const { response, body } = await getJson(`/api/admin/ai-review-queue${params.size ? `?${params}` : ''}`, token, fetchImpl);
  if (!response) return { panel: 'ai-review-queue', ok: false, status: 0, error: body.error ?? 'Network error' };
  return response.ok && Array.isArray(body.items) ? { panel: 'ai-review-queue', ok: true, items: body.items as ReviewItem[] } : { panel: 'ai-review-queue', ok: false, status: response.status, error: body.error ?? `HTTP ${response.status}` };
}

/** GET /api/admin/ai-costs (#614). */
export async function loadAiCosts(token: string, fetchImpl: typeof fetch = fetch): Promise<PanelResult> {
  const { response, body } = await getJson('/api/admin/ai-costs', token, fetchImpl);
  if (!response) return { panel: 'ai-costs', ok: false, status: 0, error: body.error ?? 'Network error' };
  return response.ok && Array.isArray(body.days) ? { panel: 'ai-costs', ok: true, days: body.days as CostDay[], asOf: Number(body.asOf) || 0, windowDays: Number(body.windowDays) || 0 }
    : { panel: 'ai-costs', ok: false, status: response.status, error: body.error ?? `HTTP ${response.status}` };
}

/** GET /api/admin/ledger-reconciliation (#432). */
export async function loadLedger(token: string, fetchImpl: typeof fetch = fetch): Promise<PanelResult> {
  const { response, body } = await getJson('/api/admin/ledger-reconciliation', token, fetchImpl);
  if (!response) return { panel: 'ledger-reconciliation', ok: false, status: 0, error: body.error ?? 'Network error' };
  return response.ok && 'report' in body ? { panel: 'ledger-reconciliation', ok: true, report: (body.report ?? null) as LedgerReport }
    : { panel: 'ledger-reconciliation', ok: false, status: response.status, error: body.error ?? `HTTP ${response.status}` };
}

/** GET /api/admin/vote-buying (#825). */
export async function loadVoteBuying(token: string, fetchImpl: typeof fetch = fetch): Promise<PanelResult> {
  const { response, body } = await getJson('/api/admin/vote-buying', token, fetchImpl);
  if (!response) return { panel: 'vote-buying', ok: false, status: 0, error: body.error ?? 'Network error' };
  return response.ok && Array.isArray(body.events) ? { panel: 'vote-buying', ok: true, events: body.events as VoteEvent[] }
    : { panel: 'vote-buying', ok: false, status: response.status, error: body.error ?? `HTTP ${response.status}` };
}

/** Seconds since the epoch as a UTC timestamp (the routes store unix seconds). */
export const utc = (seconds: number | null) => seconds == null ? '' : new Date(seconds * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

/** #880 console copy by Content (staff-only, plain and literal; filter and column labels stay the route's own field names). `proposal: true`. */
export const modConsoleCopy = {
  proposal: true,
  title: 'Mod console', token: 'Admin token', panel: 'panel', load: 'Load queue', loadAny: 'Load', loading: 'Loading…',
  empty: 'The queue is empty.', noMatch: 'No entries match these filters.', emptyPanel: 'No rows.',
  count: (n: number) => n === 1 ? '1 entry' : `${n} entries`,
  newest: (page: number) => ` · newest ${page} shown, older entries not shown`,
  noReport: 'No reconciliation report.',
} as const;
/** The status line for an accepted queue response: an empty result says whether the filters or the queue is empty. */
export const queueStatus = (n: number, filtered: boolean, page: number) =>
  n === 0 ? (filtered ? modConsoleCopy.noMatch : modConsoleCopy.empty) : modConsoleCopy.count(n) + (n >= page ? modConsoleCopy.newest(page) : '');
