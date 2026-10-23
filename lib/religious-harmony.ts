/** #842 slice 1: Religious Harmony (docs §14.5): a per-nation 0–100 score that rises with endorsed festivals and festival joins and falls
 *  with banned-festival events and raids, feeding Stability. Built only from existing signals; derived on read, no table. Behind
 *  HARIMU_RELIGIOUS_HARMONY_ENABLED. Holy sites, pilgrimage, clergy charity and disputes are out of scope. No runtime imports (tests load it directly). */
import type { GameDatabase } from './database-contract';

export type HarmonyNation = 'kindle' | 'korund' | 'aurelle';
export const harmonyNations: readonly HarmonyNation[] = ['kindle', 'korund', 'aurelle'];
export type HarmonySignals = { festivalHoliday: 0 | 1; festivalJoins: number; bannedFestivalJoins: number; raids: number; raidHits: number };
export const harmonyEnabled = (env: unknown) => (env as { HARIMU_RELIGIOUS_HARMONY_ENABLED?: string } | null)?.HARIMU_RELIGIOUS_HARMONY_ENABLED === 'true';

/** [ASSUMPTION] Every weight below is a tuning value; the docs give none. Signals look back 7 real days. */
export const harmonyWeights = {
  baseline: 50, windowSeconds: 7 * 86400,
  holiday: 10,                         // an endorsed festival public holiday today
  perJoin: 2, joinCap: 20,             // festival joins (tolerated or endorsed festivals)
  perBannedJoin: 3, bannedCap: 30,     // joins of a festival the nation bans (Korund): a banned-festival event
  perRaid: 10, raidCap: 30,            // Korund congregation raids
  perHit: 1, hitCap: 20,               // citizens caught in those raids
  stabilityPerPoints: 10, stabilityCap: 5, // Stability: ±1 per 10 points from 50, capped at ±5
} as const;
const n = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
/** Pure: start at the baseline, add and subtract the capped signal terms, clamp to 0–100. */
export function religiousHarmony(_nation: HarmonyNation, s: Partial<HarmonySignals>): number {
  const w = harmonyWeights;
  const score = w.baseline + (s.festivalHoliday === 1 ? w.holiday : 0) + Math.min(w.joinCap, n(s.festivalJoins) * w.perJoin)
    - Math.min(w.bannedCap, n(s.bannedFestivalJoins) * w.perBannedJoin) - Math.min(w.raidCap, n(s.raids) * w.perRaid) - Math.min(w.hitCap, n(s.raidHits) * w.perHit);
  return Math.max(0, Math.min(100, score));
}
/** Stability points from a Harmony score (before the 0–100 fit in lib/stability.ts). */
export function harmonyStabilityPoints(score: number) {
  const w = harmonyWeights, p = Math.trunc((score - w.baseline) / w.stabilityPerPoints);
  return Math.max(-w.stabilityCap, Math.min(w.stabilityCap, p)) || 0; // no -0
}
/** [ASSUMPTION] Bands: Strained under 35, Uneasy under 50, Calm under 65, Harmonious from 65. Korund shows only the band (the existing band rule). */
export type HarmonyBand = 'strained' | 'uneasy' | 'calm' | 'harmonious';
export const harmonyBand = (score: number): HarmonyBand => score < 35 ? 'strained' : score < 50 ? 'uneasy' : score < 65 ? 'calm' : 'harmonious';
export const harmonyBandLabel: Readonly<Record<HarmonyBand, string>> = { strained: 'Strained', uneasy: 'Uneasy', calm: 'Calm', harmonious: 'Harmonious' };
/** Panel line (placeholder copy, marked for Content): the band, plus the number outside Korund. */
export const harmonyLine = (nation: string, score: number) => `Religious Harmony: ${harmonyBandLabel[harmonyBand(score)]}${nation === 'korund' ? '' : ` (${score}/100)`}`;

/** Reads the signals for one nation as of `at` (seconds). Festival joins count by the joiner's nation; in Korund every festival is banned. */
export async function readHarmonySignals(db: GameDatabase, nation: HarmonyNation, at: number, holiday: boolean): Promise<HarmonySignals> {
  const since = at - harmonyWeights.windowSeconds;
  const row = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM citizen_festival_joins j JOIN citizens c ON c.clerk_user_id = j.user_id WHERE c.nation_id = ? AND j.joined_at > ? AND j.joined_at <= ?) AS joins,
      (SELECT COUNT(*) FROM korund_raids WHERE ? = 'korund' AND raided_at > ? AND raided_at <= ?) AS raids,
      (SELECT COUNT(*) FROM korund_raid_hits WHERE ? = 'korund' AND raided_at > ? AND raided_at <= ?) AS hits`)
    .bind(nation, since, at, nation, since, at, nation, since, at).first<{ joins: number; raids: number; hits: number }>();
  const joins = n(row?.joins);
  return { festivalHoliday: holiday ? 1 : 0, festivalJoins: nation === 'korund' ? 0 : joins, bannedFestivalJoins: nation === 'korund' ? joins : 0, raids: n(row?.raids), raidHits: n(row?.hits) };
}
export async function readHarmonyScores(db: GameDatabase, at: number, holidays: ReadonlySet<string> = new Set()): Promise<Record<HarmonyNation, number>> {
  const out = {} as Record<HarmonyNation, number>;
  for (const nation of harmonyNations) out[nation] = religiousHarmony(nation, await readHarmonySignals(db, nation, at, holidays.has(nation)));
  return out;
}
