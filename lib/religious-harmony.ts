/** #842 slice 1: Religious Harmony (docs §14.5): a per-nation 0–100 score that rises with endorsed festivals and festival joins and falls
 *  with banned-festival events and raids, feeding Stability. Built only from existing signals; derived on read, no table. Behind
 *  HARIMU_RELIGIOUS_HARMONY_ENABLED. Holy sites, pilgrimage, clergy charity and disputes are out of scope. No runtime imports (tests load it directly). */
import type { GameDatabase } from './database-contract';

export type HarmonyNation = 'kindle' | 'korund' | 'aurelle';
export const harmonyNations: readonly HarmonyNation[] = ['kindle', 'korund', 'aurelle'];
export type HarmonySignals = { festivalHoliday: 0 | 1; festivalJoins: number; bannedFestivalJoins: number; raids: number; raidHits: number };
export const harmonyEnabled = (env: unknown) => (env as { HARIMU_RELIGIOUS_HARMONY_ENABLED?: string } | null)?.HARIMU_RELIGIOUS_HARMONY_ENABLED === 'true';

/** ARC rulings (Oct 23) on #854: every weight and cap is a named config constant (tuning values; the docs give none). */
export const HARMONY_MIN = 0;
export const HARMONY_MAX = 100;
export const HARMONY_BASELINE = 50;
export const HARMONY_WINDOW_SECONDS = 7 * 86400;  // signals look back 7 real days
export const HARMONY_HOLIDAY_POINTS = 10;         // an endorsed festival public holiday today
export const HARMONY_POINTS_PER_JOIN = 2;         // festival joins (tolerated or endorsed festivals)
export const HARMONY_JOIN_CAP = 20;
export const HARMONY_POINTS_PER_BANNED_JOIN = 3;  // joins of a festival the nation bans: a banned-festival event
export const HARMONY_BANNED_CAP = 30;
export const HARMONY_POINTS_PER_RAID = 10;        // Korund congregation raids (stand in for shrine discoveries, ARC on #854)
export const HARMONY_RAID_CAP = 30;
export const HARMONY_POINTS_PER_HIT = 1;          // citizens caught in those raids
export const HARMONY_HIT_CAP = 20;
/** Band thresholds: Strained below the first, Uneasy below the second, Calm below the third, Harmonious from it. */
export const HARMONY_BAND_UNEASY_FROM = 35;
export const HARMONY_BAND_CALM_FROM = 50;
export const HARMONY_BAND_HARMONIOUS_FROM = 65;
const n = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
/** Pure: start at the baseline, add and subtract the capped signal terms, clamp to 0–100. */
export function religiousHarmony(_nation: HarmonyNation, s: Partial<HarmonySignals>): number {
  const score = HARMONY_BASELINE + (s.festivalHoliday === 1 ? HARMONY_HOLIDAY_POINTS : 0) + Math.min(HARMONY_JOIN_CAP, n(s.festivalJoins) * HARMONY_POINTS_PER_JOIN)
    - Math.min(HARMONY_BANNED_CAP, n(s.bannedFestivalJoins) * HARMONY_POINTS_PER_BANNED_JOIN) - Math.min(HARMONY_RAID_CAP, n(s.raids) * HARMONY_POINTS_PER_RAID)
    - Math.min(HARMONY_HIT_CAP, n(s.raidHits) * HARMONY_POINTS_PER_HIT);
  return Math.max(HARMONY_MIN, Math.min(HARMONY_MAX, score));
}
/** Bands from the threshold constants above. Korund shows only the band (the existing band rule). Stability points: lib/stability.ts harmonyStabilityPoints. */
export type HarmonyBand = 'strained' | 'uneasy' | 'calm' | 'harmonious';
export const harmonyBand = (score: number): HarmonyBand => score < HARMONY_BAND_UNEASY_FROM ? 'strained' : score < HARMONY_BAND_CALM_FROM ? 'uneasy' : score < HARMONY_BAND_HARMONIOUS_FROM ? 'calm' : 'harmonious';
export const harmonyBandLabel: Readonly<Record<HarmonyBand, string>> = { strained: 'Strained', uneasy: 'Uneasy', calm: 'Calm', harmonious: 'Harmonious' };
/** Panel line (placeholder copy, marked for Content): the band, plus the number outside Korund. */
export const harmonyLine = (nation: string, score: number) => `Religious Harmony: ${harmonyBandLabel[harmonyBand(score)]}${nation === 'korund' ? '' : ` (${score}/${HARMONY_MAX})`}`;

/** Reads the signals for one nation as of `at` (seconds). Festival joins count by the joiner's nation; in Korund every festival is banned. */
export async function readHarmonySignals(db: GameDatabase, nation: HarmonyNation, at: number, holiday: boolean): Promise<HarmonySignals> {
  const since = at - HARMONY_WINDOW_SECONDS;
  const row = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM citizen_festival_joins j JOIN citizens c ON c.clerk_user_id = j.user_id WHERE c.nation_id = ? AND j.joined_at > ? AND j.joined_at <= ?) AS joins,
      (SELECT COUNT(*) FROM korund_raids WHERE ? = 'korund' AND raided_at > ? AND raided_at <= ?) AS raids,
      (SELECT COUNT(*) FROM korund_raid_hits WHERE ? = 'korund' AND raided_at > ? AND raided_at <= ?) AS hits`)
    .bind(nation, since, at, nation, since, at, nation, since, at).first<{ joins: number; raids: number; hits: number }>();
  const joins = n(row?.joins);
  // TODO(#842 follow-up, ARC on #854): read festival stances from the per-nation policy table (festivalStance in lib/festivals.ts) instead of
  // treating every Korund join as banned and every other join as tolerated or endorsed.
  return { festivalHoliday: holiday ? 1 : 0, festivalJoins: nation === 'korund' ? 0 : joins, bannedFestivalJoins: nation === 'korund' ? joins : 0, raids: n(row?.raids), raidHits: n(row?.hits) };
}
export async function readHarmonyScores(db: GameDatabase, at: number, holidays: ReadonlySet<string> = new Set()): Promise<Record<HarmonyNation, number>> {
  const out = {} as Record<HarmonyNation, number>;
  for (const nation of harmonyNations) out[nation] = religiousHarmony(nation, await readHarmonySignals(db, nation, at, holidays.has(nation)));
  return out;
}
