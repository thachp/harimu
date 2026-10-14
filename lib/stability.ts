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
};
export type StabilityInputId = 'baseline'|'food'|'work'|'promises'|'petitions';
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

/** Pure scoring. Same inputs always give the same score. */
export function computeStability(raw: Partial<StabilityInputs>): StabilityScore {
 const i = {citizens: count(raw.citizens), fed: count(raw.fed), worked: count(raw.worked), promisesKept: count(raw.promisesKept), promisesBroken: count(raw.promisesBroken), petitionBacklog: count(raw.petitionBacklog)};
 const food = foodTerms(i.fed, i.citizens), work = workTerms(i.worked, i.citizens), promise = promiseTerms(i.promisesKept, i.promisesBroken), petitions = petitionTerms(i.petitionBacklog, i.citizens);
 const foodDetail = `${food.coverage}% of citizens ate in the last 24 real hours`, workDetail = `${work.share}% worked a shift in the last 24 real hours`;
 const promiseDetail = promise.rate === null ? 'No petition reviews in the last 7 real days' : `${promise.rate}% of reviewed petitions were accepted in the last 7 real days`;
 const petitionDetail = `${i.petitionBacklog} petitions awaiting review (${petitions.share} per 100 citizens)`;
 const stability: ScoreTerm[] = [
  {input:'baseline',points:stabilityBaseline,detail:'Baseline'},
  {input:'food',points:food.stability,detail:foodDetail},{input:'work',points:work.stability,detail:workDetail},
  {input:'promises',points:promise.stability,detail:promiseDetail},{input:'petitions',points:petitions.stability,detail:petitionDetail}];
 const unrest: ScoreTerm[] = [
  {input:'baseline',points:unrestBaseline,detail:'Baseline'},
  {input:'food',points:food.unrest,detail:foodDetail},{input:'work',points:work.unrest,detail:workDetail},
  {input:'promises',points:promise.unrest,detail:promiseDetail},{input:'petitions',points:petitions.unrest,detail:petitionDetail}];
 const sum = (terms: ScoreTerm[]) => terms.reduce((total, term) => total+term.points, 0);
 return {stability: sum(stability), unrest: sum(unrest), breakdown: {stability, unrest}};
}

const iso = (seconds: number) => new Date(seconds*1000).toISOString();
/** Reads the inputs for one nation as of `at` (unix seconds). */
export async function readStabilityInputs(db: GameDatabase, nationId: StabilityNation, at: number): Promise<StabilityInputs> {
 const since = at-signalWindowSeconds;
 const meals = nationId === 'kindle' ? "SELECT clerk_user_id FROM citizen_economy_events WHERE kind='meal' AND occurred_at>? AND occurred_at<=?"
  : nationId === 'korund' ? 'SELECT clerk_user_id FROM korund_meals WHERE occurred_at>? AND occurred_at<=?'
  : 'SELECT clerk_user_id FROM aurelle_meals WHERE occurred_at>? AND occurred_at<=?';
 const row = await db.prepare(`SELECT
  (SELECT COUNT(*) FROM citizens WHERE nation_id=?) AS citizens,
  (SELECT COUNT(*) FROM citizens WHERE nation_id=? AND clerk_user_id IN (${meals})) AS fed,
  (SELECT COUNT(*) FROM citizens c WHERE c.nation_id=? AND EXISTS(SELECT 1 FROM work_shifts s WHERE s.clerk_user_id=c.clerk_user_id AND s.started_at>? AND s.started_at<=?)) AS worked,
  (SELECT COUNT(*) FROM government_petition_resolutions r JOIN government_reviews v ON v.nation_id=r.nation_id AND v.period_start=r.period_start WHERE r.nation_id=? AND r.status='accepted' AND v.reviewed_at>? AND v.reviewed_at<=?) AS kept,
  (SELECT COUNT(*) FROM government_petition_resolutions r JOIN government_reviews v ON v.nation_id=r.nation_id AND v.period_start=r.period_start WHERE r.nation_id=? AND r.status='deferred' AND v.reviewed_at>? AND v.reviewed_at<=?) AS broken,
  (SELECT COUNT(*) FROM government_petitions p WHERE p.nation_id=? AND p.occurred_at<=? AND NOT EXISTS(SELECT 1 FROM government_petition_resolutions r WHERE r.request_id=p.request_id)) AS backlog`)
  .bind(nationId, nationId, since, at, nationId, iso(since), iso(at), nationId, at-promiseWindowSeconds, at, nationId, at-promiseWindowSeconds, at, nationId, at)
  .first<{citizens:number;fed:number;worked:number;kept:number;broken:number;backlog:number}>();
 return {citizens: Number(row?.citizens ?? 0), fed: Number(row?.fed ?? 0), worked: Number(row?.worked ?? 0), promisesKept: Number(row?.kept ?? 0), promisesBroken: Number(row?.broken ?? 0), petitionBacklog: Number(row?.backlog ?? 0)};
}

/** Statements that record one game day's scores. INSERT OR IGNORE makes retries no-ops. */
export async function stabilityStatements(db: GameDatabase, tick: number, scheduledAt: number, now: number) {
 return Promise.all(stabilityNations.map(async nationId => { const inputs = await readStabilityInputs(db, nationId, scheduledAt); const score = computeStability(inputs);
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
 * sustainedSeconds: real time covered by the current unbroken run of scores ≥ threshold, counting each
 * score as one full tick (latest − first + tickSeconds), so one qualifying score = 7200s; 24 scores = 48h.
 */
export async function unrestAtOrAbove(db: GameDatabase, nationId: StabilityNation, threshold: number, now: number, days = 7) {
 const history = await stabilityHistory(db, nationId, now, days*86400);
 const byDay = new Map<number, boolean>();
 for (const row of history) { const day = Math.floor(row.scheduledAt/86400); byDay.set(day, (byDay.get(day) ?? true) && row.unrest >= threshold); }
 let streakStart: number|null = null;
 for (const row of history) streakStart = row.unrest >= threshold ? streakStart ?? row.scheduledAt : null;
 return {days: [...byDay.values()].filter(Boolean).length, recordedDays: byDay.size, sustainedSeconds: streakStart === null ? 0 : history[history.length-1].scheduledAt-streakStart+tickSeconds};
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
export async function readPublicStability(db: GameDatabase): Promise<PublicStability[]> {
 return (await Promise.all(stabilityNations.map(id => latestStability(db, id)))).filter((row): row is StabilityRecord => row !== null).map(publicStability);
}
