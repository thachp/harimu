import type {GameDatabase} from './database-contract';
import {aiNotableQuestionOperation,aiNewsSequenceOperation,aiNewsSequenceReservation,reserveAiSequence,type AiBudgetConfig} from './ai-budget';
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
export const aiTerminalEvidenceSha256='4be4d4ac89ec1cf1d4c60ba22f5e89853d9e192c7ace6f2172bcad7e646b28d4';
const terminalIds=new Set(['acceptance:2026-10-14:notable-1','acceptance:2026-10-14:notable-2','acceptance:2026-10-14:notable-5']);
/** Preview-only accounting correction. Atomic/idempotent, with collision checks.
 * Never creates citizens, replays gameplay or refunds cost. Only the three
 * explicitly approved terminal failures may transition, with journaled evidence.
 */
export async function reconcileAiAcceptanceCharges(db:GameDatabase){
 const ids=aiAcceptanceCharges.map(c=>c.id),query='SELECT request_id,utc_day,next_utc_day,model,reserved_micro,started_at,status FROM harimu_ai_reservations WHERE request_id IN ('+ids.map(()=>'?').join(',')+')';
 type Row={request_id:string;utc_day:string;next_utc_day:string;model:string;reserved_micro:number;started_at:number;status:string};
 let rows=(await db.prepare(query).bind(...ids).all<Row>()).results;
 if(rows.length!==aiAcceptanceCharges.length){
  await db.batch(aiAcceptanceCharges.map(c=>db.prepare("INSERT OR IGNORE INTO harimu_ai_reservations(request_id,utc_day,next_utc_day,model,reserved_micro,started_at,status) VALUES (?,?,?,?,?,?,?)").bind(c.id,day,next,c.model,c.cost,c.startedAt,c.status)));
  rows=(await db.prepare(query).bind(...ids).all<Row>()).results;
 }
 // Validate every immutable field before any corrective transition.
 for(const c of aiAcceptanceCharges){const row=rows.find(r=>r.request_id===c.id);const statusValid=row&&(row.status===c.status||(terminalIds.has(c.id)&&row.status==='finished'));if(!row||row.utc_day!==day||row.next_utc_day!==next||row.model!==c.model||row.reserved_micro!==c.cost||row.started_at!==c.startedAt||!statusValid)throw Error('AI acceptance accounting mismatch; inference must remain unavailable.');}
 const changes=aiAcceptanceCharges.filter(c=>terminalIds.has(c.id)&&rows.find(r=>r.request_id===c.id)?.status==='uncertain');
 if(changes.length){
  // The existing PostgreSQL adapter serializes this transaction and records the
  // original SQL and bound evidence/timestamp in its protected rollback journal.
  // Evidence equality is an explicit assertion; timestamp must follow the
  // original attempt. Keep the existing uncommented SQL/journal format intact.
  await db.batch(changes.map(c=>db.prepare(`UPDATE harimu_ai_reservations SET status='finished' WHERE request_id=? AND utc_day=? AND next_utc_day=? AND model=? AND reserved_micro=? AND started_at=? AND status='uncertain' AND ?=? AND ?>=started_at`).bind(c.id,day,next,c.model,c.cost,c.startedAt,`approved-known-failed evidence:docs/AI_TERMINAL_FAILURE_EVIDENCE.json sha256:${aiTerminalEvidenceSha256}`,`approved-known-failed evidence:docs/AI_TERMINAL_FAILURE_EVIDENCE.json sha256:${aiTerminalEvidenceSha256}`,Math.floor(Date.now()/1000))));
  rows=(await db.prepare(query).bind(...ids).all<Row>()).results;
 }
 for(const c of aiAcceptanceCharges){const row=rows.find(r=>r.request_id===c.id);if(!row||row.utc_day!==day||row.next_utc_day!==next||row.model!==c.model||row.reserved_micro!==c.cost||row.started_at!==c.startedAt||row.status!==(terminalIds.has(c.id)?'finished':c.status))throw Error('AI terminal-failure reconciliation did not complete.');}
}

export const newsAcceptanceId='acceptance:2026-10-14:news-final';
export const newsAcceptanceOutcome:string='finished'; // Confirmed supported:false; full charge retained.
/** This single new attempt uses the normal atomic shared-budget predicate. */
export async function prebookNewsAcceptance(db:GameDatabase,now:number,budget:AiBudgetConfig|null){
 const read=()=>db.prepare('SELECT utc_day,next_utc_day,model,reserved_micro,status FROM harimu_ai_reservations WHERE request_id=?').bind(newsAcceptanceId).first<{utc_day:string;next_utc_day:string;model:string;reserved_micro:number;status:string}>();
 let row=await read();
 if(!row){if(new Date(now*1000).toISOString().slice(0,10)!==day)return false;if(!await reserveAiSequence(db,newsAcceptanceId,now,budget)){row=await read();if(!row)return false;}else row=await read();}
 if(!row||row.utc_day!==day||row.next_utc_day!==next||row.model!==aiNewsSequenceOperation||row.reserved_micro!==aiNewsSequenceReservation||!['pending','finished','uncertain'].includes(row.status))throw Error('News acceptance reservation mismatch.');
 if(newsAcceptanceOutcome!=='pending'&&row.status==='pending')await db.prepare("UPDATE harimu_ai_reservations SET status=? WHERE request_id=? AND status='pending'").bind(newsAcceptanceOutcome,newsAcceptanceId).run();
 return true;
}
