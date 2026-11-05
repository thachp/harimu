/** GDD v0.7: one real day equals twelve game days. Numeric deadlines are epoch milliseconds. */
import { gameSeasonAt, seasonLabels } from './game-season.ts';

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

/** #1104: NEXT_PUBLIC_HARIMU_COUNTDOWN_DUAL_TIME is a HARIMU_UI_PACK key. Layout bundles that omit the define have no `process`. A missing flag is off. */
export function countdownDualTimeFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_COUNTDOWN_DUAL_TIME; }
  catch { return undefined; }
}
export function countdownDualTimeEnabled(value: string | undefined = countdownDualTimeFlag()): boolean {
  return value === 'true';
}

/** Days and hours, then hours and minutes, then minutes, then seconds. Null when nothing remains. */
function compactRemaining(milliseconds: number): string | null {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return null;
  const seconds = Math.ceil(milliseconds / 1000);
  const days = Math.floor(seconds / 86400), hours = Math.floor(seconds % 86400 / 3600), minutes = Math.floor(seconds % 3600 / 60);
  if (days > 0) return hours ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  return minutes ? `${minutes}m` : `${seconds}s`;
}

export type DualTimeLine = { real: string; game: string; access: string };

/** Real remaining, plus the game calendar at the deadline when the world epoch is known.
 *  Without an epoch the game side is the existing 12× duration (`gameTimeCompression`). No invented rate. */
export function dualTimeCountdown(endsAt: string | number, nowMs: number, epochMs?: number): DualTimeLine | null {
  const deadline = deadlineMilliseconds(endsAt);
  if (deadline === null || !Number.isFinite(nowMs)) return null;
  const remaining = deadline - nowMs;
  const realCompact = compactRemaining(remaining);
  if (!realCompact) return null;
  const real = `${realCompact} real`;
  let game: string;
  if (typeof epochMs === 'number' && Number.isFinite(epochMs)) {
    const season = gameSeasonAt(epochMs, deadline);
    game = season ? `Year ${season.year}, ${seasonLabels[season.season]}` : `${formatDuration(remaining * gameTimeCompression)} game`;
  } else game = `${formatDuration(remaining * gameTimeCompression)} game`;
  const gameSpoken = game.startsWith('Year ') ? game : game.replace(/ game$/, ' game time');
  return { real, game, access: `${real} time; ${gameSpoken}` };
}
