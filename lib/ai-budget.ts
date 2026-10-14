import type {GameDatabase} from './database-contract';
// Verified 2026-10-14. Upper bounds cover full model context plus 256 output tokens,
// including templates. Free allowances are deliberately not deducted.
export const aiModelReservations={
 '@cf/meta/llama-3.2-3b-instruct':4200,
 '@cf/meta/llama-guard-3-8b':64000,
} as const;
export type AiModel=keyof typeof aiModelReservations;
export const aiNewsSequenceOperation='news-sequence-3b-guard-2026-10-14';
export const aiNewsSequenceReservation=aiModelReservations['@cf/meta/llama-3.2-3b-instruct']*2+aiModelReservations['@cf/meta/llama-guard-3-8b'];
export const aiDailyBudgetMicroUsd=970000; // US$0.97, below approved US$1 ceiling.
export const aiBudgetSchema=`CREATE TABLE IF NOT EXISTS harimu_ai_reservations (request_id TEXT PRIMARY KEY,utc_day TEXT NOT NULL,next_utc_day TEXT NOT NULL,model TEXT NOT NULL,reserved_micro INTEGER NOT NULL CHECK(reserved_micro>0),started_at INTEGER NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','finished','uncertain')))`;
export async function reserveAiCall(db:GameDatabase,id:string,model:AiModel,now:number,priceReviewedUntil:number){
 if(!Object.hasOwn(aiModelReservations,model))return false;return reserveBudget(db,id,model,aiModelReservations[model],1,now,priceReviewedUntil);
}
export async function reserveAiSequence(db:GameDatabase,id:string,now:number,priceReviewedUntil:number){return reserveBudget(db,id,aiNewsSequenceOperation,aiNewsSequenceReservation,3,now,priceReviewedUntil);}
async function reserveBudget(db:GameDatabase,id:string,model:string,cost:number,units:number,now:number,priceReviewedUntil:number){
 if(!Number.isSafeInteger(now)||!Number.isSafeInteger(priceReviewedUntil)||priceReviewedUntil<=now||priceReviewedUntil>now+86400||!id)return false;
 const day=new Date(now*1000).toISOString().slice(0,10),next=new Date((now+86400)*1000).toISOString().slice(0,10);
 // Pre-book the next UTC day too, to cover requests spanning midnight. Old
 // uncertain/pending calls block further inference rather than being refunded.
 const result=await db.prepare(`INSERT OR IGNORE INTO harimu_ai_reservations(request_id,utc_day,next_utc_day,model,reserved_micro,started_at,status) SELECT ?,?,?,?,?,?,'pending' WHERE NOT EXISTS(SELECT 1 FROM harimu_ai_reservations WHERE status IN ('pending','uncertain') AND utc_day<?) AND COALESCE((SELECT SUM(reserved_micro) FROM harimu_ai_reservations WHERE utc_day=? OR next_utc_day=?),0)<=?-? AND COALESCE((SELECT SUM(reserved_micro) FROM harimu_ai_reservations WHERE utc_day=? OR next_utc_day=?),0)<=?-? AND COALESCE((SELECT SUM(CASE WHEN model=? THEN 3 ELSE 1 END) FROM harimu_ai_reservations WHERE utc_day=? OR next_utc_day=?),0)<=200-? AND COALESCE((SELECT SUM(CASE WHEN model=? THEN 3 ELSE 1 END) FROM harimu_ai_reservations WHERE utc_day=? OR next_utc_day=?),0)<=200-?`).bind(id,day,next,model,cost,now,day,day,day,aiDailyBudgetMicroUsd,cost,next,next,aiDailyBudgetMicroUsd,cost,aiNewsSequenceOperation,day,day,units,aiNewsSequenceOperation,next,next,units).run();
 return result.meta.changes===1;
}
