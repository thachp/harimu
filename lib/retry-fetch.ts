// Issue #53: a dropped or slow /api request during "Collect wages and goods" left the player on
// "Connection interrupted" even though the server had settled (or would settle) the shift.
// Use ONLY for idempotent requests (shift claims and GET refreshes): each attempt sends the identical request.
export type RetryOptions = { attempts?: number; timeoutMs?: number; backoffMs?: readonly number[]; sleep?: (ms: number) => Promise<void> };
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export async function fetchIdempotent(fetchFn: FetchLike, url: string, init: RequestInit = {}, options: RetryOptions = {}): Promise<Response> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const timeoutMs = options.timeoutMs ?? 10000;
  const backoff = options.backoffMs ?? [500, 1500];
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let lastError: unknown = new Error('Request failed.');
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(backoff[Math.min(attempt - 1, backoff.length - 1)] ?? 0);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchFn(url, { ...init, signal: controller.signal });
      // 5xx may be a dropped upstream; client errors (4xx) are final answers from the server.
      if (response.status >= 500 && attempt < attempts - 1) { lastError = new Error(`Server error ${response.status}`); continue; }
      return response;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}
