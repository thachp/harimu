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

/** #423: war weariness (docs 15.3 "War weariness": every game week at war adds Unrest, more in Kindle, less in Korund; casualties and lost squares accelerate it).
 *  Pure and import-free. The docs give no numbers, so every figure below is an [ASSUMPTION] (the issue's placeholders); this block is the single place to change them.
 *  One game week = 7 game days of 7200 real seconds = 50400 real seconds (mirrors gameWeekSeconds in lib/korund.ts, repeated here to keep this file import-free).
 *  Mobilization does not count: weeks run from `mobilizationEndsAt` (the war turns `active`) and stop the moment the war ends. */
export const WEARINESS_WEEK_SECONDS = 50400;
export const wearinessConfig = {
  /** [ASSUMPTION] Unrest added per full game week at war, before the nation multiplier. */
  baseUnrestPerWeek: 2,
  /** [ASSUMPTION] Docs: more in Kindle, less in Korund; Aurelle sits between. Hoarvale, Veldwood, Varkand and Fulmara are not MVP nations and have no entry. */
  nationMultiplier: { kindle: 1.5, aurelle: 1, korund: 0.5 } as Readonly<Record<WarNationId, number>>,
  /** [ASSUMPTION] Lost frontier squares and casualties speed it up: +1 per lost square and +1 per 10 casualties, each capped. Nothing tracks either yet, so callers pass zero. */
  perLostSquare: 1, lostSquareCap: 10, casualtiesPerPoint: 10, casualtyCap: 10,
  /** [ASSUMPTION] One war can add at most this much Unrest in total (the stability score also clamps to what is left under 100). */
  totalCap: 40,
  /** [ASSUMPTION] Level names for the strip and banners (the copy module for war weariness names the levels and no numbers): rising from 1, high from 8, severe from 20 Unrest points. */
  highAt: 8, severeAt: 20,
} as const;
export type WearinessLevelId = 'rising' | 'high' | 'severe';
/** Full game weeks the war has been `active` as of `asOf`: 0 while mobilizing, 0 once it has ended (endedAt <= asOf). */
export function warWeeksAtWar(war: { mobilizationEndsAt: number; endedAt: number | null }, asOf: number): number {
  if (!Number.isFinite(asOf) || asOf < war.mobilizationEndsAt || (war.endedAt !== null && war.endedAt <= asOf)) return 0;
  return Math.floor((asOf - war.mobilizationEndsAt) / WEARINESS_WEEK_SECONDS);
}
const wholeCount = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
/** Unrest a nation's war has added so far: weeks at war x base x nation multiplier, plus capped bonuses for lost squares and casualties. Zero with no full active week
 *  (during mobilization or after the war ends), whatever the counts. An unknown nation adds nothing (fails closed). */
export function warWearinessUnrest(nation: string, weeksAtWar: number, extra: { lostSquares?: number; casualties?: number } = {}): number {
  if (!isWarNation(nation)) return 0;
  const weeks = wholeCount(weeksAtWar);
  if (weeks === 0) return 0;
  const c = wearinessConfig;
  const squares = Math.min(wholeCount(extra.lostSquares) * c.perLostSquare, c.lostSquareCap);
  const losses = Math.min(Math.floor(wholeCount(extra.casualties) / c.casualtiesPerPoint), c.casualtyCap);
  return Math.min(Math.round(weeks * c.baseUnrestPerWeek * c.nationMultiplier[nation]) + squares + losses, c.totalCap);
}
/** The level name for an amount of added Unrest; null when the war has added none. Names only: the amounts are never shown with them. */
export const wearinessLevel = (points: number): WearinessLevelId | null => points >= wearinessConfig.severeAt ? 'severe' : points >= wearinessConfig.highAt ? 'high' : points > 0 ? 'rising' : null;
