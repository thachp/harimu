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
