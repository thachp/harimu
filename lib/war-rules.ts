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
