// Top-banner shift deadline (follow-up from #54, shipped with #53). When the deadline passes, the page
// refreshes the citizen snapshot by itself, so the banner no longer asks the player to refresh.
export const shiftDeadlineConfirming = 'Deadline reached · confirming with the server…';
export const shiftDeadlineReady = 'Shift complete · collect at Work.';

export function shiftDeadlineText(shiftId: string, confirmedShiftId: string | null): string {
  return confirmedShiftId === shiftId ? shiftDeadlineReady : shiftDeadlineConfirming;
}

/** Milliseconds until the one-time refresh should fire (slightly after the deadline), or null if invalid. */
export function shiftDeadlineDelay(completesAt: string, now: number): number | null {
  const at = Date.parse(completesAt);
  if (!Number.isFinite(at)) return null;
  return Math.min(Math.max(0, at - now + 250), 2147483647);
}

/** #596 [ASSUMPTION]: does the one-time deadline refresh still add anything? `requestedAtMs` is when the request behind the current shift list STARTED (null when unknown: a saved local snapshot).
 *  The server projects a shift from its timestamps on every read, so a list requested at or after the deadline already shows the shift as finished: a refresh would only repeat the same read
 *  (a second ~5 s /api/citizen call, a "being saved" lock and a toast with no click). A deadline after the request, or an unknown request time, still refreshes, as before. */
export function deadlineNeedsRefresh(completesAt: string, requestedAtMs: number | null): boolean {
  const at = Date.parse(completesAt);
  if (!Number.isFinite(at)) return false;
  return requestedAtMs === null || at > requestedAtMs;
}
