import type {GameDatabase} from './database-contract';
// #753 slice 1 (docs §21.4 "Human review"): flagged AI outputs plus a deterministic ~1% sample of passing public outputs go to a staff review queue.
// Flag HARIMU_AI_REVIEW_QUEUE_ENABLED ("true" in preview, "false" in production). Flag off = nothing is written and the admin route is 404.
// Writes never change what the AI decided or what the player sees: a failed enqueue is swallowed.
export const aiReviewSampleBasisPoints=100; // [ASSUMPTION] §21.4 "about 1%": 100 of 10,000
export type AiReviewFilterResult='passed'|'regenerated'|'replaced';
export type AiReviewReason='flagged'|'sample';
export type AiReviewEntry={id:string;source:string;nationId:string;persona:string;outputText:string;filterResult:AiReviewFilterResult;filterDetail?:string|null};
export const aiReviewQueueSchemas=[`CREATE TABLE IF NOT EXISTS ai_review_queue (
 id TEXT PRIMARY KEY,
 created_at INTEGER NOT NULL,
 source TEXT NOT NULL CHECK(length(source) BETWEEN 1 AND 40),
 nation_id TEXT NOT NULL CHECK(nation_id IN ('kindle','korund','aurelle')),
 persona TEXT NOT NULL CHECK(length(persona) BETWEEN 1 AND 80),
 output_text TEXT NOT NULL CHECK(length(output_text)<=4000),
 filter_result TEXT NOT NULL CHECK(filter_result IN ('passed','regenerated','replaced')),
 filter_detail TEXT CHECK(filter_detail IS NULL OR length(filter_detail)<=40),
 reason TEXT NOT NULL CHECK(reason IN ('flagged','sample')),
 reviewed_at INTEGER,
 reviewer_note TEXT CHECK(reviewer_note IS NULL OR length(reviewer_note)<=500)
)`,'CREATE INDEX IF NOT EXISTS idx_ai_review_queue_created ON ai_review_queue(created_at)'];
export const aiReviewQueueEnabled=(env:{HARIMU_AI_REVIEW_QUEUE_ENABLED?:string}|null|undefined)=>env?.HARIMU_AI_REVIEW_QUEUE_ENABLED==='true';
/** Deterministic sample: FNV-1a over the output id, so a retry of the same id never changes the decision and tests can seed it. */
export function aiReviewSampled(id:string,basisPoints=aiReviewSampleBasisPoints){
 let h=0x811c9dc5;for(let i=0;i<id.length;i++){h^=id.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}
 return h%10000<basisPoints;
}
/** Enqueue a filter-failed output always, and a passing one only when sampled. Returns the reason written, or null. */
export async function enqueueAiReview(db:GameDatabase,enabled:boolean,entry:AiReviewEntry,now:number):Promise<AiReviewReason|null>{
 if(!enabled)return null;
 const reason:AiReviewReason|null=entry.filterResult!=='passed'?'flagged':aiReviewSampled(entry.id)?'sample':null;
 if(!reason)return null;
 try{
  await db.prepare('INSERT INTO ai_review_queue(id,created_at,source,nation_id,persona,output_text,filter_result,filter_detail,reason) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING')
   .bind(entry.id,now,entry.source.slice(0,40),entry.nationId,entry.persona.slice(0,80),entry.outputText.slice(0,4000),entry.filterResult,entry.filterDetail?.slice(0,40)??null,reason).run();
  return reason;
 }catch{console.warn(`[ai-review-queue] enqueue failed source=${entry.source}`);return null;}
}
export type AiReviewRow={id:string;created_at:number;source:string;nation_id:string;persona:string;output_text:string;filter_result:string;filter_detail:string|null;reason:string;reviewed_at:number|null;reviewer_note:string|null};
export async function listAiReviewQueue(db:GameDatabase,{reason,nation,limit=50,offset=0,reviewed}:{reason?:string|null;nation?:string|null;limit?:number;offset?:number;reviewed?:boolean|null}={}){
 const where:string[]=[],args:unknown[]=[];
 if(reason){where.push('reason=?');args.push(reason);}
 if(nation){where.push('nation_id=?');args.push(nation);}
 if(reviewed===true)where.push('reviewed_at IS NOT NULL');
 else if(reviewed===false)where.push('reviewed_at IS NULL');
 const lim=Math.min(Math.max(1,limit|0||50),200),off=Math.max(0,offset|0);
 const rows=await db.prepare(`SELECT id,created_at,source,nation_id,persona,output_text,filter_result,filter_detail,reason,reviewed_at,reviewer_note FROM ai_review_queue${where.length?' WHERE '+where.join(' AND '):''} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`).bind(...args,lim,off).all<AiReviewRow>();
 return rows.results??[];
}
/** #959: staff read of reviewed AI outputs (decision history). Same columns as the queue; only rows with a review. */
export async function listAiDecisions(db:GameDatabase,opts:{reason?:string|null;nation?:string|null;limit?:number;offset?:number}={}){
 return listAiReviewQueue(db,{...opts,reviewed:true});
}
/** Mark one entry reviewed with a note. Idempotent (#959): a second mark on the same id succeeds without changing the first note; unknown id returns false. */
export async function markAiReviewed(db:GameDatabase,id:string,note:string,now:number){
 const result=await db.prepare('UPDATE ai_review_queue SET reviewed_at=?,reviewer_note=? WHERE id=? AND reviewed_at IS NULL').bind(now,note,id).run();
 if(Number((result as {meta?:{changes?:number}}).meta?.changes??0)>0)return true;
 return Boolean(await db.prepare('SELECT 1 AS ok FROM ai_review_queue WHERE id=? AND reviewed_at IS NOT NULL').bind(id).first());
}
