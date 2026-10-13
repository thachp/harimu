/** GDD v0.7: one real day equals twelve game days. Numeric deadlines are epoch milliseconds. */
export const gameTimeCompression = 12;
export function deadlineMilliseconds(endsAt: string | number): number | null {
  const value = typeof endsAt === 'number' ? endsAt : Date.parse(endsAt);
  return Number.isFinite(value) && Math.abs(value) <= 8640000000000000 ? value : null;
}
export function formatDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return 'Unavailable';
  const seconds = Math.ceil(milliseconds / 1000);
  if (seconds === 0) return '0s';
  const days = Math.floor(seconds / 86400), hours = Math.floor(seconds % 86400 / 3600), minutes = Math.floor(seconds % 3600 / 60), rest = seconds % 60;
  return [days ? `${days}d` : '', hours ? `${hours}h` : '', minutes ? `${minutes}m` : '', rest ? `${rest}s` : ''].filter(Boolean).join(' ');
}
export function gameTimerSnapshot(endsAt: string | number, now: number | null): {
  status: 'invalid' | 'loading' | 'running' | 'expired'; deadline: number | null; remainingMs: number | null; real: string; game: string;
} {
  const deadline = deadlineMilliseconds(endsAt);
  if (deadline === null) return {status:'invalid',deadline,remainingMs:null,real:'Unavailable',game:'Unavailable'};
  if (now === null || !Number.isFinite(now)) return {status:'loading',deadline,remainingMs:null,real:'Checking clock…',game:'Checking clock…'};
  const remainingMs = Math.max(0,deadline-now);
  return {status:remainingMs === 0 ? 'expired' : 'running',deadline,remainingMs,real:formatDuration(remainingMs),game:formatDuration(remainingMs*gameTimeCompression)};
}
