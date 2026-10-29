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

/** #1029 (docs §17.1): festivals scheduled in game time. Faith festivals keep lib/festivals.ts's day of the 360-day year on the
 * absolute game-day clock (so they match the faith banner); a nation's own festival is a day within a season of the world clock.
 * Self-contained so the HUD and node tests resolve it without extension-less imports; tests pin it to lib/festivals.ts. */
export const festivalCalendarEnabled = (value: string | undefined = process.env.NEXT_PUBLIC_HARIMU_FESTIVAL_CALENDAR) => value === 'true';
type FestivalSlot = { name: string; dayOfYear: number; base: 'game-day' | 'world' };
/** #68 days and #270 names for the six scheduled faith festivals. National festivals stay below. */
const faithDays = {
  launching: { id: 'launching', faithId: 'fair-wind-vow', name: 'Launching', dayOfYear: 30 },
  oathDay: { id: 'oath-day', faithId: 'kinward-rite', name: 'Oath Day', dayOfYear: 90 },
  breadDay: { id: 'bread-day', faithId: 'open-hand', name: 'Bread Day', dayOfYear: 150 },
  safeReturn: { id: 'safe-return', faithId: 'fair-wind-vow', name: 'Safe Return', dayOfYear: 210 },
  nightOfNames: { id: 'night-of-names', faithId: 'kinward-rite', name: 'Night of Names', dayOfYear: 270 },
  openDoor: { id: 'day-of-the-open-door', faithId: 'open-hand', name: 'Day of the Open Door', dayOfYear: 330 },
} as const;
export const faithFestivalSlots = [faithDays.launching, faithDays.oathDay, faithDays.breadDay, faithDays.safeReturn, faithDays.nightOfNames, faithDays.openDoor];
const faith = (...keys: (keyof typeof faithDays)[]): FestivalSlot[] => keys.map(k => ({ name: faithDays[k].name, dayOfYear: faithDays[k].dayOfYear, base: 'game-day' }));
const national = (name: string, season: GameSeason, day: number): FestivalSlot => ({ name, dayOfYear: seasonOrder.indexOf(season) * 90 + day, base: 'world' });
/** ASSUMPTION table (#1029): which festivals each nation holds publicly, and the season slot of national festivals whose copy gives a season cue. */
export const nationFestivalSlots: Readonly<Record<string, readonly FestivalSlot[]>> = {
  kindle: faith('launching', 'oathDay', 'breadDay', 'safeReturn', 'nightOfNames', 'openDoor'), // secular pluralism: every faith festival is tolerated publicly
  aurelle: faith('oathDay', 'nightOfNames'), // Kinward Rite is endorsed; other faiths are private worship only
  korund: [], // all faith festivals banned publicly (§14.6)
  hoarvale: [national('Aurora Night', 'winter', 45)], // "Midwinter, under the northern lights."
  confluence: [national('Canal Festival', 'autumn', 15)], // "After the harvest"
};
const gameDayMs = 86_400_000 / 12, yearMs = 360 * gameDayMs;

/** Next (or current) one-game-day window for a festival whose year starts at `base` ms. Faith festivals use base 0 (#68 clock). */
export function festivalInstant(base: number, dayOfYear: number, nowMs: number): { startsAt: number; endsAt: number; active: boolean } {
  const offset = dayOfYear * gameDayMs;
  let startsAt = base + Math.floor((Math.max(nowMs, base) - base) / yearMs) * yearMs + offset;
  if (startsAt + gameDayMs <= nowMs) startsAt += yearMs;
  return { startsAt, endsAt: startsAt + gameDayMs, active: startsAt <= nowMs };
}

/** The nation's next (or current) festival at `nowMs`, with its game season. Null when the nation has none scheduled. */
export function nextFestivalAt(nationId: string, epochMs: number, nowMs: number): { name: string; season: GameSeason; startsAt: number; endsAt: number; active: boolean } | null {
  if (!Number.isFinite(epochMs) || !Number.isFinite(nowMs)) return null;
  const picks = (nationFestivalSlots[nationId] ?? []).map(slot => ({ name: slot.name, ...festivalInstant(slot.base === 'world' ? epochMs : 0, slot.dayOfYear, nowMs) })).sort((a, b) => a.startsAt - b.startsAt);
  const pick = picks[0];
  return pick ? { ...pick, season: gameSeasonAt(epochMs, pick.startsAt)!.season } : null;
}
