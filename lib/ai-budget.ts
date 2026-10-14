import type {GameDatabase} from './database-contract';
// ---- Versioned price table (kept in this module so the Node test runner can import it without a bundler) ----
/**
 * Versioned Workers AI price table. Each entry is the reservation upper bound in
 * micro-dollars per call: full model context plus 256 output tokens, including
 * templates. Free allowances are deliberately not deducted.
 * Bump `aiPriceTableVersion` and `aiPricesVerifiedAt` whenever prices are re-checked.
 */
export const aiPriceTableVersion=1;
export const aiPricesVerifiedAt='2026-10-14';
/** A table older than this is reported as stale (log + budget readout); it does not block AI. */
export const aiPriceStaleAfterDays=30;
export const aiModelReservations={
 '@cf/meta/llama-3.2-3b-instruct':4200,
 '@cf/meta/llama-guard-3-8b':64000,
} as const;
export type AiModel=keyof typeof aiModelReservations;
export function isPricedAiModel(model:string):model is AiModel{return Object.hasOwn(aiModelReservations,model);}
export function aiPriceAgeDays(now:number){return Math.floor((now-Date.parse(aiPricesVerifiedAt+'T00:00:00Z')/1000)/86400);}
export function aiPricesStale(now:number){return aiPriceAgeDays(now)>aiPriceStaleAfterDays;}
// ---- Durable daily budget ----
export const aiNewsSequenceOperation='news-sequence-3b-guard-2026-10-14';
export const aiNewsSequenceReservation=aiModelReservations['@cf/meta/llama-3.2-3b-instruct']*2+aiModelReservations['@cf/meta/llama-guard-3-8b'];
/** Issue #20: Cabinet petition response, its own ledger operation (same 3b+3b+guard sequence cost). */
export const aiCabinetResponseOperation='cabinet-response-3b-guard-2026-10-14';
export const aiNotableQuestionOperation='notable-question-3b-double-guard-2026-10-14';
export const aiNotableQuestionReservation=aiModelReservations['@cf/meta/llama-3.2-3b-instruct']*2+aiModelReservations['@cf/meta/llama-guard-3-8b']*2;
/** Hard ceiling: US$0.97, below the approved US$1/day. The env budget can only lower it. */
export const aiDailyBudgetMicroUsd=970000;
/** Validated runtime AI spend configuration. Null means AI is off (authored content only). */
export type AiBudgetConfig={readonly dailyBudgetMicro:number;readonly gatewayId:string};
type AiBudgetEnv={HARIMU_AI_DAILY_BUDGET_MICRO?:string;HARIMU_AI_GATEWAY_ID?:string};
let staleWarned=false;
/** Parses HARIMU_AI_DAILY_BUDGET_MICRO (integer 1..970000) and HARIMU_AI_GATEWAY_ID. Invalid or missing config fails closed (null). */
export function aiBudgetConfig(env:AiBudgetEnv,now=Math.floor(Date.now()/1000)):AiBudgetConfig|null{
 const raw=env.HARIMU_AI_DAILY_BUDGET_MICRO??'',gatewayId=env.HARIMU_AI_GATEWAY_ID??'';
 if(!/^[1-9][0-9]{0,8}$/.test(raw)||!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(gatewayId))return null;
 const dailyBudgetMicro=Number(raw);if(dailyBudgetMicro>aiDailyBudgetMicroUsd)return null;
 if(aiPricesStale(now)&&!staleWarned){staleWarned=true;console.warn(`[ai-budget] Workers AI price table v${aiPriceTableVersion} was verified ${aiPricesVerifiedAt} (${aiPriceAgeDays(now)} days ago); re-verify prices in lib/ai-budget.ts.`);}
 return {dailyBudgetMicro,gatewayId};
}
function validConfig(config:unknown):config is AiBudgetConfig{
 if(!config||typeof config!=='object')return false;const c=config as AiBudgetConfig;
 return Number.isSafeInteger(c.dailyBudgetMicro)&&c.dailyBudgetMicro>0&&c.dailyBudgetMicro<=aiDailyBudgetMicroUsd&&typeof c.gatewayId==='string'&&/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(c.gatewayId);
}
/** Workers AI run options routing the call through the configured AI Gateway. */
export function aiGatewayOptions(config:AiBudgetConfig){return {gateway:{id:config.gatewayId}};}
/**
 * A pending/uncertain reservation from an earlier UTC day blocks new reservations only for this long after it
 * started (each call times out after 30s). After an AI or gateway outage the stale row stops blocking; its full
 * charge is never refunded and still counts against the day(s) it reserved.
 */
export const aiUncertainBlockTtlSeconds=3600;
/** #92: a 'pending' row was never marked sent (see markAiReservationSent), so its inference never reached the gateway (each call times out
 * after 30s, a sequence has at most four). It stops counting and is deleted on the next reservation. */
export const aiPendingExpirySeconds=aiUncertainBlockTtlSeconds;
/** #92: withdraw a reservation whose inference never reached the gateway (nothing was sent, so nothing is charged). */
export async function releaseAiReservation(db:GameDatabase,id:string){await db.prepare("DELETE FROM harimu_ai_reservations WHERE request_id=? AND status='pending'").bind(id).run();}
/** #92: persist "handed to the gateway" BEFORE the first gateway call. 'uncertain' = sent, outcome unknown: it never
 * expires and is never released, so a crash mid-call stays charged and keeps its request id (Notable replay guard). */
export async function markAiReservationSent(db:GameDatabase,id:string){await db.prepare("UPDATE harimu_ai_reservations SET status='uncertain' WHERE request_id=? AND status='pending'").bind(id).run();}
/** #92: ids of the removed preview acceptance ledger/prebook. Written by readiness, never sent through the gateway,
 * some already 'finished'/'uncertain'. Real ids are UUIDs, notable:<sha>: or cabinet:, so this never matches them. */
export const legacyPhantomReservationPattern='acceptance:%';
/** #92: expire stale pending rows (no gateway evidence) and release the legacy phantom rows so neither consumes the
 * daily budget. Idempotent; a plain DELETE the app role already performs for over-cap rows (no elevated privileges). */
export async function expireStaleAiReservations(db:GameDatabase,now:number){if(!Number.isSafeInteger(now))return;await db.prepare("DELETE FROM harimu_ai_reservations WHERE (status='pending' AND started_at<=?) OR request_id LIKE ?").bind(now-aiPendingExpirySeconds,legacyPhantomReservationPattern).run();}
export const aiBudgetSchema=`CREATE TABLE IF NOT EXISTS harimu_ai_reservations (request_id TEXT PRIMARY KEY,utc_day TEXT NOT NULL,next_utc_day TEXT NOT NULL,model TEXT NOT NULL,reserved_micro INTEGER NOT NULL CHECK(reserved_micro>0),started_at INTEGER NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','finished','uncertain')))`;
export async function reserveAiCall(db:GameDatabase,id:string,model:AiModel,now:number,config:AiBudgetConfig|null){
 if(!isPricedAiModel(model))return false;return reserveBudget(db,id,model,aiModelReservations[model],1,now,config);
}
export async function reserveAiCabinetSequence(db:GameDatabase,id:string,now:number,config:AiBudgetConfig|null){
 return reserveBudget(db,id,aiCabinetResponseOperation,aiNewsSequenceReservation,3,now,config);
}
export async function reserveAiSequence(db:GameDatabase,id:string,now:number,config:AiBudgetConfig|null,quota?:{ownerPrefix:string;dailyLimit:number},freeform=false){
 if(quota&&(!/^[a-z]+:[a-f0-9]{64}:$/.test(quota.ownerPrefix)||!id.startsWith(quota.ownerPrefix)||!Number.isSafeInteger(quota.dailyLimit)||quota.dailyLimit<1||quota.dailyLimit>20))return false;
 return reserveBudget(db,id,freeform?aiNotableQuestionOperation:aiNewsSequenceOperation,freeform?aiNotableQuestionReservation:aiNewsSequenceReservation,freeform?4:3,now,config,quota);
}
async function reserveBudget(db:GameDatabase,id:string,model:string,cost:number,units:number,now:number,config:AiBudgetConfig|null,quota?:{ownerPrefix:string;dailyLimit:number}){
 // Fail closed: no valid budget config (or a legacy timestamp argument) means no reservation.
 if(!Number.isSafeInteger(now)||!validConfig(config)||!id)return false;
 const budget=config.dailyBudgetMicro;
 await expireStaleAiReservations(db,now);
 const day=new Date(now*1000).toISOString().slice(0,10),next=new Date((now+86400)*1000).toISOString().slice(0,10);
 // Pre-book the next UTC day too, to cover requests spanning midnight. Earlier-day
 // uncertain/pending calls block further inference for aiUncertainBlockTtlSeconds; they are never refunded.
 // Step 1: one atomic conditional INSERT ... SELECT (a single statement in its own write transaction).
 const limits=`COALESCE((SELECT SUM(reserved_micro) FROM harimu_ai_reservations WHERE utc_day=? OR next_utc_day=?),0)<=?-? AND COALESCE((SELECT SUM(reserved_micro) FROM harimu_ai_reservations WHERE utc_day=? OR next_utc_day=?),0)<=?-? AND COALESCE((SELECT SUM(CASE WHEN model=? OR model='cabinet-response-3b-guard-2026-10-14' THEN 3 WHEN model=? THEN 4 ELSE 1 END) FROM harimu_ai_reservations WHERE utc_day=? OR next_utc_day=?),0)<=200-? AND COALESCE((SELECT SUM(CASE WHEN model=? OR model='cabinet-response-3b-guard-2026-10-14' THEN 3 WHEN model=? THEN 4 ELSE 1 END) FROM harimu_ai_reservations WHERE utc_day=? OR next_utc_day=?),0)<=200-? AND (?=0 OR (SELECT COUNT(*) FROM harimu_ai_reservations WHERE request_id LIKE ? AND utc_day=?)<?)`;
 const result=await db.prepare(`INSERT OR IGNORE INTO harimu_ai_reservations(request_id,utc_day,next_utc_day,model,reserved_micro,started_at,status) SELECT ?,?,?,?,?,?,'pending' WHERE NOT EXISTS(SELECT 1 FROM harimu_ai_reservations WHERE status IN ('pending','uncertain') AND utc_day<? AND started_at>?) AND ${limits}`).bind(id,day,next,model,cost,now,day,now-aiUncertainBlockTtlSeconds,day,day,budget,cost,next,next,budget,cost,aiNewsSequenceOperation,aiNotableQuestionOperation,day,day,units,aiNewsSequenceOperation,aiNotableQuestionOperation,next,next,units,quota?1:0,quota?quota.ownerPrefix+'%':'',day,quota?.dailyLimit??0).run();
 if(result.meta.changes!==1)return false;
 // Step 2: committed re-check. Under READ COMMITTED two concurrent inserts could each miss the other's
 // uncommitted row. After commit, the later re-check of any racing pair sees both rows, so an over-cap
 // total is always detected and the losing pending row (no inference made yet) is withdrawn. Ties fail
 // closed (both withdraw). Postgres writes additionally serialize on the adapter's transaction advisory lock.
 const totals=`SELECT COALESCE(SUM(CASE WHEN utc_day=? OR next_utc_day=? THEN reserved_micro ELSE 0 END),0) AS day_micro,COALESCE(SUM(CASE WHEN utc_day=? OR next_utc_day=? THEN reserved_micro ELSE 0 END),0) AS next_micro,COALESCE(SUM(CASE WHEN utc_day=? OR next_utc_day=? THEN (CASE WHEN model=? OR model='cabinet-response-3b-guard-2026-10-14' THEN 3 WHEN model=? THEN 4 ELSE 1 END) ELSE 0 END),0) AS day_units,COALESCE(SUM(CASE WHEN utc_day=? OR next_utc_day=? THEN (CASE WHEN model=? OR model='cabinet-response-3b-guard-2026-10-14' THEN 3 WHEN model=? THEN 4 ELSE 1 END) ELSE 0 END),0) AS next_units,COALESCE(SUM(CASE WHEN ?=1 AND request_id LIKE ? AND utc_day=? THEN 1 ELSE 0 END),0) AS owned FROM harimu_ai_reservations`;
 const check=await db.prepare(totals).bind(day,day,next,next,day,day,aiNewsSequenceOperation,aiNotableQuestionOperation,next,next,aiNewsSequenceOperation,aiNotableQuestionOperation,quota?1:0,quota?quota.ownerPrefix+'%':'',day).first<{day_micro:number;next_micro:number;day_units:number;next_units:number;owned:number}>();
 const over=!check||check.day_micro>budget||check.next_micro>budget||check.day_units>200||check.next_units>200||(quota!==undefined&&check.owned>quota.dailyLimit);
 if(over){await db.prepare("DELETE FROM harimu_ai_reservations WHERE request_id=? AND status='pending'").bind(id).run();return false;}
 return true;
}

export async function readAiBudget(db:GameDatabase,now:number,config?:AiBudgetConfig|null){
 const limit=config===undefined?aiDailyBudgetMicroUsd:validConfig(config)?config.dailyBudgetMicro:0;
 if(!Number.isSafeInteger(now))throw Error('Invalid budget time.');
 const day=new Date(now*1000).toISOString().slice(0,10),nextDay=new Date((now+86400)*1000).toISOString().slice(0,10);
 const row=await db.prepare("SELECT COALESCE(SUM(CASE WHEN (utc_day=? OR next_utc_day=?) AND (status<>'pending' OR started_at>?) AND request_id NOT LIKE 'acceptance:%' THEN reserved_micro ELSE 0 END),0) AS reserved,COALESCE(SUM(CASE WHEN (utc_day=? OR next_utc_day=?) AND (status<>'pending' OR started_at>?) AND request_id NOT LIKE 'acceptance:%' THEN reserved_micro ELSE 0 END),0) AS next_reserved,COALESCE(SUM(CASE WHEN status IN ('pending','uncertain') AND utc_day<? AND started_at>? THEN 1 ELSE 0 END),0) AS blocked FROM harimu_ai_reservations").bind(day,day,now-aiPendingExpirySeconds,nextDay,nextDay,now-aiPendingExpirySeconds,day,now-aiUncertainBlockTtlSeconds).first<{reserved:number;next_reserved:number;blocked:number}>();
 if(!row||![row.reserved,row.next_reserved,row.blocked].every(n=>Number.isSafeInteger(n)&&n>=0))throw Error('AI budget unavailable.');
 return {day,nextDay,reservedMicroUsd:row.reserved,nextDayReservedMicroUsd:row.next_reserved,remainingMicroUsd:Math.max(0,Math.min(limit-row.reserved,limit-row.next_reserved)),dailyBudgetMicroUsd:limit,pricesVerifiedAt:aiPricesVerifiedAt,priceTableVersion:aiPriceTableVersion,pricesStale:aiPricesStale(now),blocked:row.blocked>0,topicMicroUsd:aiNewsSequenceReservation,questionMicroUsd:aiNotableQuestionReservation};
}
