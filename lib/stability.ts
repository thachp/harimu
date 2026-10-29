import type {GameDatabase} from './database-contract';
/** Mirrors world-simulation tickSeconds (one game day); duplicated to avoid an import cycle. */
export const tickSeconds = 7200;

/**
 * Daily (per game day) Stability and Unrest scores for the MVP nations (issue #69).
 * Contract documented in docs/STABILITY_UNREST.md; #70 (Korund purge) and #71 (Aurelle Rising) read it.
 * Scores are integers 0–100 and every breakdown entry sums exactly to its score (no clamping is needed).
 */
export const stabilityNations = ['kindle','korund','aurelle'] as const;
export type StabilityNation = typeof stabilityNations[number];
/** Trailing real-time windows for the inputs, in seconds. */
export const signalWindowSeconds = 86400;
export const promiseWindowSeconds = 7*86400;

export const stabilitySchemas = [
 `CREATE TABLE IF NOT EXISTS nation_stability_scores (nation_id TEXT NOT NULL CHECK(nation_id IN ('kindle','korund','aurelle')),tick INTEGER NOT NULL CHECK(tick>0),scheduled_at INTEGER NOT NULL,computed_at INTEGER NOT NULL,stability INTEGER NOT NULL CHECK(stability BETWEEN 0 AND 100),unrest INTEGER NOT NULL CHECK(unrest BETWEEN 0 AND 100),inputs_json TEXT NOT NULL,breakdown_json TEXT NOT NULL,PRIMARY KEY(nation_id,tick))`,
 `CREATE INDEX IF NOT EXISTS idx_nation_stability_time ON nation_stability_scores(nation_id,scheduled_at)`,
] as const;

/** Raw input counts. All are non-negative integers read from authoritative tables. */
export type StabilityInputs = {
 citizens: number; fed: number; worked: number;
 promisesKept: number; promisesBroken: number; petitionBacklog: number;
 /** #291: 1 on a game day that is an endorsed festival public holiday in this nation (docs 14.4). Absent otherwise. */
 festivalHoliday?: 1;
 /** #842: the nation's Religious Harmony score (0–100), only while HARIMU_RELIGIOUS_HARMONY_ENABLED is on. Absent otherwise, so flag-off inputs_json is unchanged. */
 harmony?: number;
 /** #423: Unrest points the nation's active wars have added (war weariness, lib/war-rules.ts), only while HARIMU_WAR_WEARINESS_ENABLED is on. Absent when zero. */
 warWeariness?: number;
 /** #739/#822: 1 when Dormant citizens were excluded (dormancy flag on, live tick). Absent otherwise, so flag-off inputs_json is unchanged. */
 activeOnly?: 1;
 /** #967: Korund cities whose rations are cut this game week. Absent unless that step applies, so flag-off inputs_json is unchanged. */
 rationCuts?: number;
 /** #983: Korund cities taking one Stability step back up this game week. Absent unless that step applies, so flag-off inputs_json is unchanged. */
 rationRecovery?: number;
};
export type StabilityInputId = 'baseline'|'food'|'work'|'promises'|'petitions'|'festival'|'war'|'harmony'|'ration'|'rationRecovery';
export type ScoreTerm = {input: StabilityInputId; points: number; detail: string};
export type StabilityScore = {stability: number; unrest: number; breakdown: {stability: ScoreTerm[]; unrest: ScoreTerm[]}};
export type StabilityRecord = StabilityScore & {nationId: StabilityNation; tick: number; scheduledAt: number; inputs: StabilityInputs};

const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
const pct = (part: number, whole: number, neutral = 50) => whole > 0 ? Math.min(100, Math.round(part*100/whole)) : neutral;

/** Food coverage: share of citizens who ate in the trailing 24h. Stability −15..+15, Unrest 0..40. */
export function foodTerms(fed: number, citizens: number) { const c = pct(Math.min(fed,citizens), citizens);
 return {stability: Math.round((c-50)*0.3), unrest: Math.round((100-c)*0.4), coverage: c}; }
/** Work: share of citizens who started a shift in the trailing 24h. Stability −10..+10, Unrest 0..15. */
export function workTerms(worked: number, citizens: number) { const w = pct(Math.min(worked,citizens), citizens);
 return {stability: Math.round((w-50)*0.2), unrest: Math.round((100-w)*0.15), share: w}; }
/** Promise-keeping: accepted / reviewed petitions in the trailing 7 days. No reviews is neutral (0 points). */
export function promiseTerms(kept: number, broken: number) { const total = kept+broken; if (!total) return {stability: 0, unrest: 0, rate: null as number|null};
 const p = pct(kept, total); return {stability: Math.round((p-50)*0.2), unrest: Math.round((100-p)*0.15), rate: p as number|null}; }
/** Petition backlog: unreviewed petitions per 100 citizens, capped at 100. Stability −15..0, Unrest 0..20. */
export function petitionTerms(backlog: number, citizens: number) { const s = citizens > 0 ? Math.min(100, Math.round(backlog*100/citizens)) : 0;
 return {stability: -Math.round(s*0.15), unrest: Math.round(s*0.2), share: s}; }

export const stabilityBaseline = 50, unrestBaseline = 10;
/** #291 [ASSUMPTION]: docs 14.4 says an endorsed festival gives "Stability +" but no size. Tuning value: +3 Stability on that game day only. */
export const festivalHolidayStabilityPoints = 3;
/** #967 [ASSUMPTION]: docs 12.11 step 4 says a plan shortfall cuts Stability but gives no size. Tuning value: this many points per Korund city with a ration cut that game week. */
export const korundRationStabilityStep = 3;

/** #842 (ARC rulings Oct 23): Religious Harmony → Stability mapping, as named config constants (no runtime import: this file loads directly in tests). */
export const HARMONY_STABILITY_NEUTRAL = 50;          // the Harmony score that adds nothing
export const HARMONY_STABILITY_POINTS_PER_STEP = 1;
export const HARMONY_STABILITY_STEP = 10;             // Harmony points per Stability step
export const HARMONY_STABILITY_CAP = 5;               // at most ± this many Stability points
export function harmonyStabilityPoints(score: number) {
 const p = Math.trunc((score-HARMONY_STABILITY_NEUTRAL)/HARMONY_STABILITY_STEP)*HARMONY_STABILITY_POINTS_PER_STEP;
 return Math.max(-HARMONY_STABILITY_CAP, Math.min(HARMONY_STABILITY_CAP, p)) || 0; // no -0
}
/** Pure scoring. Same inputs always give the same score. */
export function computeStability(raw: Partial<StabilityInputs>): StabilityScore {
 const i = {citizens: count(raw.citizens), fed: count(raw.fed), worked: count(raw.worked), promisesKept: count(raw.promisesKept), promisesBroken: count(raw.promisesBroken), petitionBacklog: count(raw.petitionBacklog)};
 const holiday = raw.festivalHoliday === 1;
 // #291 (docs 14.4: public holiday = "one fewer shift that game day"): the only shift expectation in the code is this work-turnout
 // term, so on a holiday it cannot count against the nation: a turnout shortfall adds no Unrest and no negative Stability.
 const rawWork = workTerms(i.worked, i.citizens);
 const food = foodTerms(i.fed, i.citizens), work = holiday ? {...rawWork, stability: Math.max(0, rawWork.stability), unrest: 0} : rawWork, promise = promiseTerms(i.promisesKept, i.promisesBroken), petitions = petitionTerms(i.petitionBacklog, i.citizens);
 // #815 (QA1 nit): with no counted citizens (none at all, or every one Dormant, #739) the shares are the neutral 50, so the copy says so instead of a made-up 50%.
 // #822 (QA1): only on the live dormancy path; flag off keeps the exact previous copy (and breakdown_json) even for a nation with zero citizens.
 const none = raw.activeOnly === 1 && i.citizens === 0, noneDetail = 'No active citizens: neutral score';
 const foodDetail = none ? noneDetail : `${food.coverage}% of citizens ate in the last 24 real hours`, workDetail = (none ? noneDetail : `${work.share}% worked a shift in the last 24 real hours`)+(holiday?' (public holiday: one fewer shift expected, a shortfall is not counted)':'');
 const promiseDetail = promise.rate === null ? 'No petition reviews in the last 7 real days' : `${promise.rate}% of reviewed petitions were accepted in the last 7 real days`;
 const petitionDetail = `${i.petitionBacklog} petitions awaiting review (${petitions.share} per 100 citizens)`;
 const stability: ScoreTerm[] = [
  {input:'baseline',points:stabilityBaseline,detail:'Baseline'},
  {input:'food',points:food.stability,detail:foodDetail},{input:'work',points:work.stability,detail:workDetail},
  {input:'promises',points:promise.stability,detail:promiseDetail},{input:'petitions',points:petitions.stability,detail:petitionDetail},
  ...(holiday?[{input:'festival' as const,points:festivalHolidayStabilityPoints,detail:'Endorsed festival: public holiday'}]:[])];
 // #842 (ARC rulings Oct 23): Harmony adds harmonyStabilityPoints, fitted so the score stays 0–100 and the breakdown still sums exactly.
 if (raw.harmony !== undefined) { const h = Math.max(0, Math.min(100, Math.round(Number(raw.harmony) || 0))), base = stability.reduce((t, x) => t+x.points, 0);
  const pts = Math.max(-base, Math.min(100-base, harmonyStabilityPoints(h)));
  stability.push({input:'harmony',points:pts,detail:`Religious Harmony ${h}/100`}); }
 // #967: one step per city whose rations are cut this week. Fitted under the terms already counted so Stability stays at or above 0 (the existing floor).
 const cities = count(raw.rationCuts);
 if (cities > 0) { const base = stability.reduce((t, x) => t+x.points, 0), pts = -Math.min(base, cities*korundRationStabilityStep) || 0;
  stability.push({input:'ration',points:pts,detail:'Plan shortfall ration cut'}); }
 // #983: one step back up per city whose closed week met the quota after a ration-cut hit. Fitted so Stability stays at or below 100 and the breakdown still sums exactly.
 // [ASSUMPTION] the sentence is the player notice (lib/ration-copy.ts). The doc cuts Stability and does not name the recovery line.
 const recovered = count(raw.rationRecovery);
 if (recovered > 0) { const base = stability.reduce((t, x) => t+x.points, 0), pts = Math.min(Math.max(0, 100-base), recovered*korundRationStabilityStep);
  stability.push({input:'rationRecovery',points:pts,detail:'Stability recovers with the plan.'}); }
 const unrest: ScoreTerm[] = [
  {input:'baseline',points:unrestBaseline,detail:'Baseline'},
  {input:'food',points:food.unrest,detail:foodDetail},{input:'work',points:work.unrest,detail:workDetail},
  {input:'promises',points:promise.unrest,detail:promiseDetail},{input:'petitions',points:petitions.unrest,detail:petitionDetail}];
 const sum = (terms: ScoreTerm[]) => terms.reduce((total, term) => total+term.points, 0);
 // #423: the other Unrest terms can already reach 100 together, so the war term only takes what is left under 100 (the one place a term is clamped); the breakdown still sums exactly to the score.
 const war = Math.min(count(raw.warWeariness), Math.max(0, 100-sum(unrest)));
 if (war > 0) unrest.push({input:'war',points:war,detail:'Weeks at war add Unrest'});
 return {stability: sum(stability), unrest: sum(unrest), breakdown: {stability, unrest}};
}

const iso = (seconds: number) => new Date(seconds*1000).toISOString();
/** Reads the inputs for one nation as of `at` (unix seconds). Every input is windowed on `at`, so a catch-up tick
 * reads that game day's records: a petition resolved after `at` still counts as backlog for that tick (#142). */
/** #739 slice 2 (ARC): `dormantBefore` is the ISO cutoff from lib/dormancy-rules.ts dormantAt (DORMANCY_DAYS.dormant). Only a well-formed ISO last_active_at (24 chars, as written
 *  by the heartbeat and 0069) at or before it makes a citizen Dormant; NULL or malformed counts as active. This file keeps no runtime imports (tests load it directly). */
const notDormant = " AND NOT (c.last_active_at IS NOT NULL AND length(c.last_active_at)=24 AND c.last_active_at<=?)";
export async function readStabilityInputs(db: GameDatabase, nationId: StabilityNation, at: number, options: {holidayNations?: ReadonlySet<string>; warWeariness?: Readonly<Record<string, number>>; dormantBefore?: string; harmony?: Readonly<Record<string, number>>} = {}): Promise<StabilityInputs> {
 const since = at-signalWindowSeconds;
 // #739 slice 2 (ARC): with dormantBefore (flag on, live tick only), the citizens/fed/worked counts leave out citizens Dormant at `at`, so food and work shares exclude them. Flag off: the SQL text is unchanged (tests/world-repair-cap-679 matches it).
 const nd = options.dormantBefore ? notDormant : '', cut = options.dormantBefore ? [options.dormantBefore] : [];
 const meals = nationId === 'kindle' ? "SELECT clerk_user_id FROM citizen_economy_events WHERE kind='meal' AND occurred_at>? AND occurred_at<=?"
  : nationId === 'korund' ? 'SELECT clerk_user_id FROM korund_meals WHERE occurred_at>? AND occurred_at<=?'
  : 'SELECT clerk_user_id FROM aurelle_meals WHERE occurred_at>? AND occurred_at<=?';
 const row = await db.prepare(`SELECT
  (SELECT COUNT(*) FROM citizens${nd ? ` c WHERE c.nation_id=?${nd}` : ' WHERE nation_id=?'}) AS citizens,
  (SELECT COUNT(*) FROM citizens${nd ? ` c WHERE c.nation_id=?${nd} AND c.` : ' WHERE nation_id=? AND '}clerk_user_id IN (${meals})) AS fed,
  (SELECT COUNT(*) FROM citizens c WHERE c.nation_id=?${nd} AND EXISTS(SELECT 1 FROM work_shifts s WHERE s.clerk_user_id=c.clerk_user_id AND s.started_at>? AND s.started_at<=?)) AS worked,
  (SELECT COUNT(*) FROM government_petition_resolutions r JOIN government_reviews v ON v.nation_id=r.nation_id AND v.period_start=r.period_start WHERE r.nation_id=? AND r.status='accepted' AND v.reviewed_at>? AND v.reviewed_at<=?) AS kept,
  (SELECT COUNT(*) FROM government_petition_resolutions r JOIN government_reviews v ON v.nation_id=r.nation_id AND v.period_start=r.period_start WHERE r.nation_id=? AND r.status='deferred' AND v.reviewed_at>? AND v.reviewed_at<=?) AS broken,
  (SELECT COUNT(*) FROM government_petitions p WHERE p.nation_id=? AND p.occurred_at<=? AND NOT EXISTS(SELECT 1 FROM government_petition_resolutions r JOIN government_reviews v ON v.nation_id=r.nation_id AND v.period_start=r.period_start WHERE r.request_id=p.request_id AND v.reviewed_at<=?)) AS backlog`)
  .bind(nationId, ...cut, nationId, ...cut, since, at, nationId, ...cut, iso(since), iso(at), nationId, at-promiseWindowSeconds, at, nationId, at-promiseWindowSeconds, at, nationId, at, at)
  .first<{citizens:number;fed:number;worked:number;kept:number;broken:number;backlog:number}>();
 // #291: the caller (world tick, only while HARIMU_FAITH_ENABLED is on) names the nations whose game day is an endorsed festival holiday (lib/festivals.ts).
 const holiday = options.holidayNations?.has(nationId) ?? false;
 const war = Math.floor(Number(options.warWeariness?.[nationId] ?? 0)); // #423: precomputed by the world tick from the wars table (lib/war-weariness.ts)
 return {citizens: Number(row?.citizens ?? 0), fed: Number(row?.fed ?? 0), worked: Number(row?.worked ?? 0), promisesKept: Number(row?.kept ?? 0), promisesBroken: Number(row?.broken ?? 0), petitionBacklog: Number(row?.backlog ?? 0), ...(holiday ? {festivalHoliday: 1 as const} : {}), ...(war > 0 ? {warWeariness: war} : {}), ...(options.dormantBefore ? {activeOnly: 1 as const} : {}), ...(options.harmony && options.harmony[nationId] !== undefined ? {harmony: options.harmony[nationId]} : {})};
}

/** Statements that record one game day's scores. INSERT OR IGNORE makes retries no-ops. */
export async function stabilityStatements(db: GameDatabase, tick: number, scheduledAt: number, now: number, options: {holidayNations?: ReadonlySet<string>; warWeariness?: Readonly<Record<string, number>>; dormantBefore?: string; harmony?: Readonly<Record<string, number>>; rationCuts?: number; rationRecovery?: number} = {}) {
 return Promise.all(stabilityNations.map(async nationId => { const inputs = await readStabilityInputs(db, nationId, scheduledAt, options); if (nationId === 'korund' && options.rationCuts) inputs.rationCuts = options.rationCuts; if (nationId === 'korund' && options.rationRecovery) inputs.rationRecovery = options.rationRecovery; const score = computeStability(inputs);
  return db.prepare('INSERT OR IGNORE INTO nation_stability_scores (nation_id,tick,scheduled_at,computed_at,stability,unrest,inputs_json,breakdown_json) VALUES (?,?,?,?,?,?,?,?)')
   .bind(nationId, tick, scheduledAt, now, score.stability, score.unrest, JSON.stringify(inputs), JSON.stringify(score.breakdown)); }));
}

type Row = {nation_id:StabilityNation;tick:number;scheduled_at:number;stability:number;unrest:number;inputs_json:string;breakdown_json:string};
const record = (row: Row): StabilityRecord => ({nationId: row.nation_id, tick: Number(row.tick), scheduledAt: Number(row.scheduled_at), stability: Number(row.stability), unrest: Number(row.unrest), inputs: JSON.parse(row.inputs_json), breakdown: JSON.parse(row.breakdown_json)});

/** Latest recorded score for a nation, or null before the first game day is processed. Server-side truth. */
export async function latestStability(db: GameDatabase, nationId: StabilityNation): Promise<StabilityRecord|null> {
 const row = await db.prepare('SELECT * FROM nation_stability_scores WHERE nation_id=? ORDER BY tick DESC LIMIT 1').bind(nationId).first<Row>();
 return row ? record(row) : null;
}
/** Scores recorded in (now − sinceSeconds, now], oldest first. */
export async function stabilityHistory(db: GameDatabase, nationId: StabilityNation, now: number, sinceSeconds = promiseWindowSeconds): Promise<StabilityRecord[]> {
 const rows = await db.prepare('SELECT * FROM nation_stability_scores WHERE nation_id=? AND scheduled_at>? AND scheduled_at<=? ORDER BY tick').bind(nationId, now-sinceSeconds, now).all<Row>();
 return rows.results.map(record);
}
/**
 * "Days Unrest ≥ threshold in the last N real days": the number of distinct real UTC days in the window
 * where every recorded game-day score had Unrest ≥ threshold (a day with no scores does not count).
 * sustainedSeconds: real time covered by the current unbroken run of scores ≥ threshold ending at the latest score.
 * Each qualifying score counts as one full tick (7200s; 24 scores = 48h). The run only continues across consecutive
 * ticks (tick === previous + 1): a missing or never-processed tick breaks it, so gaps never count as Unrest (#142).
 */
export async function unrestAtOrAbove(db: GameDatabase, nationId: StabilityNation, threshold: number, now: number, days = 7) {
 const history = await stabilityHistory(db, nationId, now, days*86400);
 const byDay = new Map<number, boolean>();
 for (const row of history) { const day = Math.floor(row.scheduledAt/86400); byDay.set(day, (byDay.get(day) ?? true) && row.unrest >= threshold); }
 let run = 0, previousTick: number|null = null;
 for (const row of history) { run = row.unrest >= threshold ? (previousTick !== null && row.tick === previousTick+1 ? run+1 : 1) : 0; previousTick = row.tick; }
 return {days: [...byDay.values()].filter(Boolean).length, recordedDays: byDay.size, sustainedSeconds: run*tickSeconds};
}

/** Coarse band; thresholds are internal and not published. */
export type Band = 'Low'|'Mid'|'High';
const band = (percent: number): Band => percent >= 67 ? 'High' : percent >= 34 ? 'Mid' : 'Low';
/** Rounds a citizen count to the nearest 10 (minimum display "under 10" is 0). */
const roundCitizens = (value: number) => Math.round(value/10)*10;
/**
 * Citizen-facing view. Korund publishes a state-approved figure plus coarse system stats only (GDD 8.6,
 * architect decision on #95): bands and rounded citizens, never exact inputs that would let a client
 * reconstruct the true score. True values stay server-side.
 */
export type PublicStability = {nationId: StabilityNation; tick: number; scheduledAt: number} & (
 {kind: 'measured'; stability: number; unrest: number; breakdown: StabilityScore['breakdown']} |
 {kind: 'state-approved'; approvedStability: number; systemStats: {citizensApprox: number; foodSupply: Band; workTurnout: Band}});
export const korundApprovedStability = 92;
export function publicStability(row: StabilityRecord): PublicStability {
 if (row.nationId !== 'korund') return {nationId: row.nationId, tick: row.tick, scheduledAt: row.scheduledAt, kind: 'measured', stability: row.stability, unrest: row.unrest, breakdown: row.breakdown};
 const i = row.inputs;
 // The approved figure is a constant so it carries no information about the true score.
 return {nationId: row.nationId, tick: row.tick, scheduledAt: row.scheduledAt, kind: 'state-approved', approvedStability: korundApprovedStability,
  systemStats: {citizensApprox: roundCitizens(i.citizens), foodSupply: band(pct(Math.min(i.fed,i.citizens), i.citizens, 0)), workTurnout: band(pct(Math.min(i.worked,i.citizens), i.citizens, 0))}};
}
/** Hotfix for #95: true only when nation_stability_scores does not exist (migration 0012 not applied):
 * Postgres SQLSTATE 42P01 (also as the adapter's "PostgreSQL operation failed (42P01)."), "relation … does not exist", or the SQLite/D1 equivalent "no such table". */
export function isMissingStabilityTable(error: unknown): boolean {
 const e = error as {code?: unknown; message?: unknown; cause?: unknown} | null;
 if (!e || typeof e !== 'object') return false;
 const message = typeof e.message === 'string' ? e.message : '';
 // #159/#179: only a missing nation_stability_scores is swallowed. The error must name that relation; a bare 42P01
 // with no relation name could be any table, so it is rethrown. The Postgres adapter keeps the relation name (#179).
 const named = /relation "?([\w.]+)"? does not exist|no such table: ([\w.]+)/i.exec(message);
 if (named) return /(^|\.)nation_stability_scores$/i.test(named[1] ?? named[2]);
 return e.cause !== undefined && e.cause !== error ? isMissingStabilityTable(e.cause) : false;
}
export async function readPublicStability(db: GameDatabase): Promise<PublicStability[]> {
 try { return (await Promise.all(stabilityNations.map(id => latestStability(db, id)))).filter((row): row is StabilityRecord => row !== null).map(publicStability); }
 catch (error) { if (isMissingStabilityTable(error)) return []; throw error; }
}
