/** #743 slice 1: out-of-character Report intake for city chat messages and Notable replies (docs moderation-safety §21.3, §21.1). Write-only from the
 *  player side: no API returns report rows to players. Table from migration 0070 only. Flag HARIMU_REPORTS_ENABLED. */
import type {GameDatabase} from './database-contract';
import {reasonsFor,type ReportReasonId} from './report-copy';
import {uuidPattern} from './square-chat-validation';
import {ownerPrefix} from './notables';

export const reportDailyLimit=10;
export const reportNoteMax=280;
export type ReportKind='citizen-message'|'notable-reply';
export type ReportResult={status:number;body:Record<string,unknown>};
const kinds:readonly ReportKind[]=['citizen-message','notable-reply'];
const err=(status:number,error:string,extra:Record<string,unknown>={}):ReportResult=>({status,body:{error,...extra}});

/** Insert only when the reporter is under the real-day limit; request id and (reporter,target) are unique, so a race cannot double-count. */
const insertSql=`INSERT INTO moderation_reports(id,request_id,reporter_id,target_kind,target_id,reason_id,note,created_at)
SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM moderation_reports WHERE reporter_id=? AND created_at>=?)<? ON CONFLICT DO NOTHING`;

async function targetVisible(db:GameDatabase,userId:string,nationId:string,kind:ReportKind,targetId:string){
 // A chat message is reportable while it is live in the reporter's own nation's square, and not by its author.
 if(kind==='citizen-message')return Boolean(await db.prepare('SELECT 1 AS ok FROM square_messages WHERE id=? AND nation_id=? AND deleted=0 AND user_id<>?').bind(targetId,nationId,userId).first());
 // A Notable reply is only shown to the citizen who asked, so it must be one of their own Notable requests (the reservation row).
 return Boolean(await db.prepare('SELECT 1 AS ok FROM harimu_ai_reservations WHERE request_id=?').bind((await ownerPrefix(userId))+targetId).first());
}

export async function submitReport(db:GameDatabase,userId:string,nationId:string,body:Record<string,unknown>,now:number):Promise<ReportResult>{
 const {requestId,targetKind,targetId,reasonId,note}=body;
 if(typeof requestId!=='string'||!uuidPattern.test(requestId))return err(400,'A valid request ID is required.');
 if(typeof targetKind!=='string'||!(kinds as readonly string[]).includes(targetKind))return err(400,'Choose something to report.');
 if(typeof targetId!=='string'||!uuidPattern.test(targetId))return err(400,'Choose something to report.');
 const kind=targetKind as ReportKind;
 if(typeof reasonId!=='string'||!reasonsFor(kind).some(r=>r.id===reasonId))return err(400,'Choose a listed reason.');
 if(note!==undefined&&note!==null&&(typeof note!=='string'||note.trim().length>reportNoteMax))return err(400,`Notes are limited to ${reportNoteMax} characters.`);
 const cleanNote=typeof note==='string'&&note.trim()?note.trim():null;
 const request=requestId.toLowerCase(),target=targetId.toLowerCase();
 const same=(row:{reporter_id:string;target_kind:string;target_id:string;reason_id:string}|null)=>row&&row.reporter_id===userId&&row.target_kind===kind&&row.target_id===target&&row.reason_id===reasonId;
 const prior=await db.prepare('SELECT reporter_id,target_kind,target_id,reason_id FROM moderation_reports WHERE request_id=?').bind(request).first<{reporter_id:string;target_kind:string;target_id:string;reason_id:string}>();
 if(prior)return same(prior)?{status:201,body:{ok:true}}:err(409,'Request already used.');
 if(!await targetVisible(db,userId,nationId,kind,target))return err(404,'That item is not available to report.');
 const dayStart=now-now%86400;
 const result=await db.prepare(insertSql).bind(crypto.randomUUID(),request,userId,kind,target,reasonId as ReportReasonId,cleanNote,now,userId,dayStart,reportDailyLimit).run();
 if(result.meta.changes)return {status:201,body:{ok:true}};
 const replay=await db.prepare('SELECT reporter_id,target_kind,target_id,reason_id FROM moderation_reports WHERE request_id=?').bind(request).first<{reporter_id:string;target_kind:string;target_id:string;reason_id:string}>();
 if(replay)return same(replay)?{status:201,body:{ok:true}}:err(409,'Request already used.');
 if(await db.prepare('SELECT 1 AS ok FROM moderation_reports WHERE reporter_id=? AND target_kind=? AND target_id=?').bind(userId,kind,target).first())return err(409,'You already reported this.',{duplicate:true});
 return err(429,`You can send up to ${reportDailyLimit} reports a day.`);
}
