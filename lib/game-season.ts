/** #1023, docs §17.1: game seasons (spring, summer, autumn, winter) rotate every 7.5 real days, so one 30-real-day cycle is one 360-game-day year at 12×. Display only. */
export const seasonOrder = ['spring', 'summer', 'autumn', 'winter'] as const;
export type GameSeason = typeof seasonOrder[number];
export const seasonLabels: Record<GameSeason, string> = { spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' };
export const seasonLengthMs = 7.5 * 86_400_000;
export const seasonCycleMs = seasonOrder.length * seasonLengthMs;

/** #1023: build flag NEXT_PUBLIC_HARIMU_SEASON_CLOCK ("true" in preview, "false" in production). */
export const seasonClockEnabled = (value: string | undefined = process.env.NEXT_PUBLIC_HARIMU_SEASON_CLOCK) => value === 'true';

/** The season at `nowMs` for a world whose clock started at `epochMs` (spring begins at the epoch). Before the epoch it is still the first spring. */
export function gameSeasonAt(epochMs: number, nowMs: number): { season: GameSeason; next: GameSeason; year: number; startsAt: number; endsAt: number; remainingMs: number } | null {
  if (!Number.isFinite(epochMs) || !Number.isFinite(nowMs)) return null;
  const elapsed = Math.max(0, nowMs - epochMs);
  const index = Math.floor(elapsed / seasonLengthMs);
  const startsAt = epochMs + index * seasonLengthMs, endsAt = startsAt + seasonLengthMs;
  return { season: seasonOrder[index % 4], next: seasonOrder[(index + 1) % 4], year: Math.floor(index / 4) + 1, startsAt, endsAt, remainingMs: endsAt - Math.max(nowMs, epochMs) };
}
