'use client';
import { useCallback, useState } from 'react';

/** #928: a session card whose signed-in load failed (a 5xx or no connection) shows this instead of staying hidden until a full reload; the government
 *  panel's Retry pattern (status line + one button). A 4xx (not eligible, not signed in, flag off) is not a failure: the card stays hidden as before. */
export function useLoadRetry() {
  const [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  const fail = useCallback(() => setFailed(true), []);
  const retry = useCallback(() => { setFailed(false); setAttempt(a => a + 1); }, []);
  return { failed, fail, attempt, retry };
}
/** Throws on a 5xx so the load's catch marks it failed; passes every other response through unchanged. */
export const okOr5xx = (response: Response) => { if (response.status >= 500) throw new Error(String(response.status)); return response; };

export function SessionRetry({ name, onRetry }: { name: string; onRetry: () => void }) {
  return <section className="citizen-market session-retry" aria-label={name}><p role="status">{name} did not load.</p><button type="button" onClick={onRetry} aria-label={`Retry ${name}`}>Retry</button></section>;
}
