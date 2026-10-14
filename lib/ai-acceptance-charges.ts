import type {GameDatabase} from './database-contract';
import {aiNotableQuestionOperation} from './ai-budget';
// Actual 2026-10-14 provider attempts: conservative full reservations, never
// reported-token estimates. Synthetic gameplay records remain in local fixtures.
export const aiAcceptanceCharges=[
 {id:'acceptance:2026-10-14:generation-probe',model:'@cf/meta/llama-3.2-3b-instruct',cost:4200,startedAt:1791965562,status:'finished'},
 {id:'acceptance:2026-10-14:notable-1',model:aiNotableQuestionOperation,cost:136400,startedAt:1791965661,status:'uncertain'},
 {id:'acceptance:2026-10-14:notable-2',model:aiNotableQuestionOperation,cost:136400,startedAt:1791965778,status:'uncertain'},
 {id:'acceptance:2026-10-14:notable-3',model:aiNotableQuestionOperation,cost:136400,startedAt:1791965827,status:'finished'},
 {id:'acceptance:2026-10-14:notable-4',model:aiNotableQuestionOperation,cost:136400,startedAt:1791965931,status:'finished'},
 {id:'acceptance:2026-10-14:notable-5',model:aiNotableQuestionOperation,cost:136400,startedAt:1791965992,status:'uncertain'},
 {id:'acceptance:2026-10-14:notable-6',model:aiNotableQuestionOperation,cost:136400,startedAt:1791966068,status:'finished'},
 {id:'acceptance:2026-10-14:moderation-probe',model:'@cf/meta/llama-guard-3-8b',cost:64000,startedAt:1791966223,status:'finished'},
] as const;
const day='2026-10-14',next='2026-10-15';
/** Preview-only accounting correction. Atomic/idempotent, with collision checks.
 * Never creates citizens, replays gameplay, refunds cost or resolves uncertainty.
 */
export async function reconcileAiAcceptanceCharges(db:GameDatabase){
 const ids=aiAcceptanceCharges.map(c=>c.id),query='SELECT request_id,utc_day,next_utc_day,model,reserved_micro,status FROM harimu_ai_reservations WHERE request_id IN ('+ids.map(()=>'?').join(',')+')';
 type Row={request_id:string;utc_day:string;next_utc_day:string;model:string;reserved_micro:number;status:string};
 let rows=(await db.prepare(query).bind(...ids).all<Row>()).results;
 if(rows.length!==aiAcceptanceCharges.length){
  await db.batch(aiAcceptanceCharges.map(c=>db.prepare("INSERT OR IGNORE INTO harimu_ai_reservations(request_id,utc_day,next_utc_day,model,reserved_micro,started_at,status) VALUES (?,?,?,?,?,?,?)").bind(c.id,day,next,c.model,c.cost,c.startedAt,c.status)));
  rows=(await db.prepare(query).bind(...ids).all<Row>()).results;
 }
 for(const c of aiAcceptanceCharges){const row=rows.find(r=>r.request_id===c.id);if(!row||row.utc_day!==day||row.next_utc_day!==next||row.model!==c.model||row.reserved_micro!==c.cost||row.status!==c.status)throw Error('AI acceptance accounting mismatch; inference must remain unavailable.');}
}
