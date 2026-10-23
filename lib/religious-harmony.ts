/** #842 slice 1: Religious Harmony (docs §14.5): a per-nation 0–100 score that rises with endorsed festivals and festival joins and falls
 *  with banned-festival events and raids, feeding Stability. Built only from existing signals; derived on read, no table. Behind
 *  HARIMU_RELIGIOUS_HARMONY_ENABLED. #855 slice 2 adds holy-site pilgrimages and clergy charity (lib/holy-sites.ts); disputes stay out of scope. No runtime imports (tests load it directly). */
import type { GameDatabase } from './database-contract';

export type HarmonyNation = 'kindle' | 'korund' | 'aurelle';
export const harmonyNations: readonly HarmonyNation[] = ['kindle', 'korund', 'aurelle'];
export type HarmonySignals = { festivalHoliday: 0 | 1; festivalJoins: number; bannedFestivalJoins: number; raids: number; raidHits: number; pilgrimagesGranted: number; pilgrimagesDenied: number; charityActs: number };
/** #855: festival stance lookup (festivalStance in lib/festivals.ts, the per-nation policy table), injected so this module keeps no runtime imports. */
export type HarmonyStanceOf = (nationId: string, faithId: string) => 'endorsed' | 'tolerated' | 'banned' | null;
export const harmonyFestivalFaiths = ['kinward-rite', 'fair-wind-vow', 'open-hand'] as const;
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
/** #855 slice 2 (tuning values; the docs give none). Pilgrimages and denials count for the custodian nation; charity for the officiant's nation. */
export const HARMONY_POINTS_PER_PILGRIMAGE = 2;   // a granted holy-site pilgrimage
export const HARMONY_PILGRIMAGE_CAP = 10;
export const HARMONY_POINTS_PER_DENIED = 3;       // a denied pilgrimage
export const HARMONY_DENIED_CAP = 15;
export const HARMONY_POINTS_PER_CHARITY = 2;      // a clergy charity act
export const HARMONY_CHARITY_CAP = 10;
/** Band thresholds: Strained below the first, Uneasy below the second, Calm below the third, Harmonious from it. */
export const HARMONY_BAND_UNEASY_FROM = 35;
export const HARMONY_BAND_CALM_FROM = 50;
export const HARMONY_BAND_HARMONIOUS_FROM = 65;
const n = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
/** Pure: start at the baseline, add and subtract the capped signal terms, clamp to 0–100. */
export function religiousHarmony(_nation: HarmonyNation, s: Partial<HarmonySignals>): number {
  const score = HARMONY_BASELINE + (s.festivalHoliday === 1 ? HARMONY_HOLIDAY_POINTS : 0) + Math.min(HARMONY_JOIN_CAP, n(s.festivalJoins) * HARMONY_POINTS_PER_JOIN)
    - Math.min(HARMONY_BANNED_CAP, n(s.bannedFestivalJoins) * HARMONY_POINTS_PER_BANNED_JOIN) - Math.min(HARMONY_RAID_CAP, n(s.raids) * HARMONY_POINTS_PER_RAID)
    - Math.min(HARMONY_HIT_CAP, n(s.raidHits) * HARMONY_POINTS_PER_HIT)
    + Math.min(HARMONY_PILGRIMAGE_CAP, n(s.pilgrimagesGranted) * HARMONY_POINTS_PER_PILGRIMAGE) + Math.min(HARMONY_CHARITY_CAP, n(s.charityActs) * HARMONY_POINTS_PER_CHARITY)
    - Math.min(HARMONY_DENIED_CAP, n(s.pilgrimagesDenied) * HARMONY_POINTS_PER_DENIED);
  return Math.max(HARMONY_MIN, Math.min(HARMONY_MAX, score));
}
/** Bands from the threshold constants above. Korund shows only the band (the existing band rule). Stability points: lib/stability.ts harmonyStabilityPoints. */
export type HarmonyBand = 'strained' | 'uneasy' | 'calm' | 'harmonious';
export const harmonyBand = (score: number): HarmonyBand => score < HARMONY_BAND_UNEASY_FROM ? 'strained' : score < HARMONY_BAND_CALM_FROM ? 'uneasy' : score < HARMONY_BAND_HARMONIOUS_FROM ? 'calm' : 'harmonious';
export const harmonyBandLabel: Readonly<Record<HarmonyBand, string>> = { strained: 'Strained', uneasy: 'Uneasy', calm: 'Calm', harmonious: 'Harmonious' };
/** Panel line (placeholder copy, marked for Content): the band, plus the number outside Korund. */
export const harmonyLine = (nation: string, score: number) => `Religious Harmony: ${harmonyBandLabel[harmonyBand(score)]}${nation === 'korund' ? '' : ` (${score}/${HARMONY_MAX})`}`;

/** Reads every nation's signals as of `at` (seconds) in one query (QA3 on #854: one round trip per scored tick, not one per nation).
 *  Festival joins count by the joiner's nation, split by that nation's stance toward the festival's faith (#855: `stanceOf`, the policy
 *  table; without it every Korund join counts as banned, the slice 1 rule). Raids and raid hits are Korund's. */
export async function readAllHarmonySignals(db: GameDatabase, at: number, holidays: ReadonlySet<string> = new Set(), stanceOf?: HarmonyStanceOf): Promise<Record<HarmonyNation, HarmonySignals>> {
  const since = at - HARMONY_WINDOW_SECONDS, cols: string[] = [], binds: number[] = [];
  const banned = (nation: HarmonyNation, faith: string) => stanceOf ? stanceOf(nation, faith) === 'banned' : nation === 'korund';
  const col = (sql: string, name: string) => { cols.push(`(${sql} AND ${name.startsWith('acts') ? 'a.acted_at' : 'j.joined_at'} > ? AND ${name.startsWith('acts') ? 'a.acted_at' : 'j.joined_at'} <= ?) AS ${name}`); binds.push(since, at); };
  const faithIn = (faiths: string[]) => faiths.length ? `j.faith_id IN (${faiths.map(f => `'${f}'`).join(', ')})` : '1 = 0';
  for (const nation of harmonyNations) {
    const joins = `SELECT COUNT(*) FROM citizen_festival_joins j JOIN citizens c ON c.clerk_user_id = j.user_id WHERE c.nation_id = '${nation}' AND `;
    col(joins + faithIn(harmonyFestivalFaiths.filter(f => !banned(nation, f))), `${nation}_joins`);
    col(joins + faithIn(harmonyFestivalFaiths.filter(f => banned(nation, f))), `${nation}_banned`);
    for (const outcome of ['granted', 'denied', 'given']) col(`SELECT COUNT(*) FROM faith_harmony_acts a WHERE a.nation_id = '${nation}' AND a.outcome = '${outcome}'`, `acts_${nation}_${outcome}`);
  }
  const row = await db.prepare(`SELECT ${cols.join(', ')},
      (SELECT COUNT(*) FROM korund_raids WHERE raided_at > ? AND raided_at <= ?) AS raids,
      (SELECT COUNT(*) FROM korund_raid_hits WHERE raided_at > ? AND raided_at <= ?) AS hits`)
    .bind(...binds, since, at, since, at).first<Record<string, number>>();
  const out = {} as Record<HarmonyNation, HarmonySignals>;
  for (const nation of harmonyNations) {
    const korund = nation === 'korund';
    out[nation] = { festivalHoliday: holidays.has(nation) ? 1 : 0, festivalJoins: n(row?.[`${nation}_joins`]), bannedFestivalJoins: n(row?.[`${nation}_banned`]), raids: korund ? n(row?.raids) : 0, raidHits: korund ? n(row?.hits) : 0,
      pilgrimagesGranted: n(row?.[`acts_${nation}_granted`]), pilgrimagesDenied: n(row?.[`acts_${nation}_denied`]), charityActs: n(row?.[`acts_${nation}_given`]) };
  }
  return out;
}
export async function readHarmonySignals(db: GameDatabase, nation: HarmonyNation, at: number, holiday: boolean, stanceOf?: HarmonyStanceOf): Promise<HarmonySignals> {
  return (await readAllHarmonySignals(db, at, holiday ? new Set([nation]) : new Set(), stanceOf))[nation];
}
export async function readHarmonyScores(db: GameDatabase, at: number, holidays: ReadonlySet<string> = new Set(), stanceOf?: HarmonyStanceOf): Promise<Record<HarmonyNation, number>> {
  const signals = await readAllHarmonySignals(db, at, holidays, stanceOf), out = {} as Record<HarmonyNation, number>;
  for (const nation of harmonyNations) out[nation] = religiousHarmony(nation, signals[nation]);
  return out;
}
