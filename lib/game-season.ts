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
const faithDays = { nightOfNames: { name: 'Night of Names', dayOfYear: 270 }, oathDay: { name: 'Oath Day', dayOfYear: 90 }, launching: { name: 'Launching', dayOfYear: 30 }, safeReturn: { name: 'Safe Return', dayOfYear: 210 }, breadDay: { name: 'Bread Day', dayOfYear: 150 }, openDoor: { name: 'Day of the Open Door', dayOfYear: 330 } };
const faith = (...keys: (keyof typeof faithDays)[]): FestivalSlot[] => keys.map(k => ({ ...faithDays[k], base: 'game-day' }));
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

/** The nation's next (or current) festival at `nowMs`, with its game season. Null when the nation has none scheduled. */
export function nextFestivalAt(nationId: string, epochMs: number, nowMs: number): { name: string; season: GameSeason; startsAt: number; endsAt: number; active: boolean } | null {
  if (!Number.isFinite(epochMs) || !Number.isFinite(nowMs)) return null;
  const picks = (nationFestivalSlots[nationId] ?? []).map(slot => {
    const base = slot.base === 'world' ? epochMs : 0, offset = slot.dayOfYear * gameDayMs;
    let startsAt = base + Math.floor((Math.max(nowMs, base) - base) / yearMs) * yearMs + offset;
    if (startsAt + gameDayMs <= nowMs) startsAt += yearMs;
    return { name: slot.name, startsAt, endsAt: startsAt + gameDayMs };
  }).sort((a, b) => a.startsAt - b.startsAt);
  const pick = picks[0];
  return pick ? { ...pick, season: gameSeasonAt(epochMs, pick.startsAt)!.season, active: pick.startsAt <= nowMs } : null;
}

/** #1034 (docs §17.1 "seasons ... affect sea lanes"): winter storms slow sea freight from port cities. Server flag
 * HARIMU_SEASON_SEA_LANES_ENABLED (in HARIMU_CITY_PACK): "true" in preview, "false" in production; off means callers skip this.
 * [ASSUMPTION] values from #1034: winter 80% for port freight, other seasons ×1.0, rounded down, never below 1 unit. Inland freight is unaffected.
 * `port` is the caller's port-only check (role contains Port; ARC on #1037: inland trade zones are not sea lanes). */
export const winterFreightPercent = 80; // integer percent, no float math
export const seaLanesStormy = (season: GameSeason | null | undefined, port: boolean) => port && season === 'winter';
export function seaFreightQuantity(quantity: number, season: GameSeason | null | undefined, port: boolean): number {
  if (!seaLanesStormy(season, port) || !Number.isFinite(quantity) || quantity <= 0) return quantity;
  return Math.max(1, Math.floor(quantity * winterFreightPercent / 100));
}
/** The port city panel's one-line note while winter lasts, with the time left on the season clock. Null otherwise. */
export function seaLanesStormNote(epochMs: number, nowMs: number, port: boolean): string | null {
  const now = gameSeasonAt(epochMs, nowMs);
  if (!now || !seaLanesStormy(now.season, port)) return null;
  const hours = Math.max(1, Math.ceil(now.remainingMs / 3_600_000)), days = Math.floor(hours / 24), rest = hours % 24;
  const left = [days ? `${days}d` : '', rest || !days ? `${rest}h` : ''].filter(Boolean).join(' ');
  return `Winter storms: sea freight slowed until spring (${left} left).`;
}
