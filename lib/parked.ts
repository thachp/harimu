/** #679: helpers for starting independent reads early without changing what is awaited. */

/** Marks a speculative read as handled, so a branch that never awaits it leaves no unhandled rejection. Awaiting it still rethrows. */
export const parked = <T,>(promise: Promise<T>): Promise<T> => { promise.catch(() => {}); return promise; };

/** Maps `items` with at most `limit` calls of `run` in flight at once. Results keep the order of `items`. */
export async function mapLimited<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length); let next = 0;
  const worker = async () => { while (next < items.length) { const index = next++; results[index] = await run(items[index]); } };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return results;
}
