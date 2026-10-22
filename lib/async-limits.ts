/** #679: helpers for starting independent reads early without changing what is awaited. */

/** Marks a speculative read as handled, so a branch that never awaits it leaves no unhandled rejection. Awaiting it still rethrows. */
export const parked = <T,>(promise: Promise<T>): Promise<T> => { promise.catch(() => {}); return promise; };

/** Maps `items` with at most `limit` calls of `run` in flight at once. Results keep the order of `items`.
 *  After the first failure no new item is started; items already in flight still settle, then the first error is rethrown. */
export async function mapLimited<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError(`mapLimited: limit must be a positive integer, got ${String(limit)}`);
  const results = new Array<R>(items.length); let next = 0, failed = false, firstError: unknown;
  const worker = async () => {
    while (!failed && next < items.length) {
      const index = next++;
      try { results[index] = await run(items[index]); } catch (error) { if (!failed) { failed = true; firstError = error; } }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failed) throw firstError;
  return results;
}
