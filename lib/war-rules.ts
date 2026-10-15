/** #309: pure war-declaration rules (no imports, so tests can load this file directly). Canon: harimu-docs 15.3 (a formal
 *  declaration with a 48-real-hour mobilization before any attack), 15.4 (no declarations during a shard's first 30 days,
 *  the Founding Period) and 13.2 (a non-aggression pact bars declarations between its signatories; a ceasefire or peace
 *  locks declarations for 10 real days). The 10-day lock is itself a docs [ASSUMPTION] (13.5). Times are epoch seconds. */
export const warNations = ['kindle', 'korund', 'aurelle'] as const;
export type WarNationId = typeof warNations[number];
export const warNationNames: Readonly<Record<WarNationId, string>> = { kindle: 'Kindle', korund: 'Korund', aurelle: 'Aurelle' };
/** [ASSUMPTION] Peace lock: a ceasefire or peace treaty locks new declarations between the pair for 10 real days. Docs 13.2 give a lock,
 *  13.5 marks the number as an assumption. The single place to change it. */
export const PEACE_LOCK_SECONDS = 10 * 86400;
export const warConfig = {
  mobilizationSeconds: 48 * 3600, // docs 15.3
  foundingPeriodSeconds: 30 * 86400, // docs 15.4
  peaceLockSeconds: PEACE_LOCK_SECONDS, // docs 13.2 (13.5 marks the number [ASSUMPTION])
  casusBelliMax: 40, // WAR_LABEL_MAX in lib/war-copy.ts
  actorMax: 60,
} as const;
export type WarStatus = 'mobilizing' | 'active' | 'ended';
export type WarEndKind = 'treaty' | 'other';
export type WarTimes = { declaredAt: number; mobilizationEndsAt: number; endedAt: number | null };

export const isWarNation = (value: unknown): value is WarNationId => typeof value === 'string' && (warNations as readonly string[]).includes(value);
export const pairKey = (a: string, b: string) => [a, b].sort().join(':');
/** Computed on read: `mobilizing` turns into `active` exactly at mobilizationEndsAt (declaredAt + 48 real hours); no write is needed. */
export function warStatus(war: WarTimes, now: number): WarStatus {
  if (war.endedAt !== null) return 'ended';
  return now >= war.mobilizationEndsAt ? 'active' : 'mobilizing';
}
/** The first second at which an attack could begin. */
export const mobilizationEnd = (declaredAt: number) => declaredAt + warConfig.mobilizationSeconds;
export const foundingPeriodEnd = (shardStartedAt: number) => shardStartedAt + warConfig.foundingPeriodSeconds;
/** Founding Period: the shard's first 30 real days. An unknown shard start fails closed (no declarations). */
export const inFoundingPeriod = (shardStartedAt: number | null, now: number) => shardStartedAt === null || now < foundingPeriodEnd(shardStartedAt);
export const peaceLockEnd = (endedAt: number) => endedAt + warConfig.peaceLockSeconds;

export type DeclarationBlock = 'founding_period' | 'non_aggression' | 'peace_lock';
/** Why a declaration is refused, in the order the reasons are checked; null when none applies. */
export function declarationBlock(input: { now: number; shardStartedAt: number | null; nonAggression: boolean; lastTreatyEndedAt: number | null }): DeclarationBlock | null {
  if (inFoundingPeriod(input.shardStartedAt, input.now)) return 'founding_period';
  if (input.nonAggression) return 'non_aggression';
  if (input.lastTreatyEndedAt !== null && input.now < peaceLockEnd(input.lastTreatyEndedAt)) return 'peace_lock';
  return null;
}
/** Plain-text label: control characters and markup are dropped, whitespace collapsed, length capped. */
export const cleanLabel = (value: unknown, max: number) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim() : '';
/** Fills {placeholder} slots of the war copy (lib/war-copy.ts); unknown slots are left as they are. */
export const fillWarText = (text: string, values: Record<string, string>) => text.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
export const requestIdOk = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(value);

/** #310: daily defense windows. Canon: harimu-docs 15.3 ("Each nation sets a daily 4-hour defense window (its 'prime time'). Attacks on cities and forts can only
 *  be resolved inside the defender's window ... Open-field skirmishes on frontier squares can happen anytime"), 17.3 (battle windows are defender-chosen).
 *  A window is stored as a start hour in UTC and lasts 4 real hours: [start, start+4h), the start second is inside and the end second is outside.
 *  Times are epoch seconds. Pure: no imports, so tests load this file directly. */
export const defenseWindowConfig = {
  windowSeconds: 4 * 3600, // docs 15.3
  /** [ASSUMPTION] A nation may change its window at most once per 7 real days (the issue text; the docs give no limit). The single place to change it. */
  changeCooldownSeconds: 7 * 86400,
} as const;
export type DefenseStartHours = Readonly<Record<WarNationId, number>>;
/** [ASSUMPTION] Seed windows (start hour, UTC) until a nation sets its own: staggered so the three nations are never all open at once. The docs name no hours.
 *  Kindle 22:00-02:00 (crosses UTC midnight), Korund 14:00-18:00, Aurelle 18:00-22:00. */
export const defaultDefenseStartHours: DefenseStartHours = { kindle: 22, korund: 14, aurelle: 18 };
export const isDefenseStartHour = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 23;
const DAY = 86400;
/** True when `at` falls in the 4-hour window that starts at `startHourUtc` each UTC day (handles a window that crosses UTC midnight). */
export function inDefenseWindow(startHourUtc: number, at: number): boolean {
  if (!isDefenseStartHour(startHourUtc) || !Number.isFinite(at)) return false;
  const secondOfDay = ((Math.floor(at) % DAY) + DAY) % DAY;
  return (secondOfDay - startHourUtc * 3600 + DAY) % DAY < defenseWindowConfig.windowSeconds;
}
/** Docs 15.3: an assault on a city or fort can be resolved only inside the defender's window. An unknown nation fails closed (false).
 *  `startHours` defaults to the seed windows; the server passes the saved ones (readDefenseWindows in lib/war.ts). */
export const canResolveCityAssault = (defenderNation: string, at: number, startHours: DefenseStartHours = defaultDefenseStartHours) =>
  isWarNation(defenderNation) && inDefenseWindow(startHours[defenderNation], at);
/** Docs 15.3: open-field skirmishes on frontier squares can happen anytime (they move control only slowly; that is not built here). */
export const canResolveFieldSkirmish = () => true;
/** When the window may next change; null when it has never been set (the first pick is free). */
export const defenseWindowNextChange = (changedAt: number | null) => changedAt === null ? null : changedAt + defenseWindowConfig.changeCooldownSeconds;
export const defenseWindowChangeAllowed = (changedAt: number | null, now: number) => changedAt === null || now >= changedAt + defenseWindowConfig.changeCooldownSeconds;
const clock = (minutes: number) => { const m = ((minutes % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
/** "HH:MM" start and end of a window in the viewer's local time. `viewerOffsetMinutes` is minutes east of UTC (UTC-7 is -420, UTC+9 is 540, UTC+5:30 is 330). */
export function defenseWindowLocal(startHourUtc: number, viewerOffsetMinutes: number): { start: string; end: string } {
  const offset = Number.isFinite(viewerOffsetMinutes) ? Math.round(viewerOffsetMinutes) : 0;
  const start = startHourUtc * 60 + offset;
  return { start: clock(start), end: clock(start + defenseWindowConfig.windowSeconds / 60) };
}
