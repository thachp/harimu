/** #743 slice 1 and #1462 slice 2: out-of-character Report intake (docs moderation-safety §21.3, §21.1). Write-only from the
 *  player side: no API returns report rows to players. Table from migrations 0070 and 0133. Flag HARIMU_REPORTS_ENABLED. */
import {env} from 'cloudflare:workers';
import type {GameDatabase} from './database-contract';
import {reasonsFor,reportReasons,type ReportReasonId} from './report-copy';
import {uuidPattern} from './square-chat-validation';
import {ownerPrefix} from './notables';
import {newsEditionOptions,readNationalNews} from './national-news';
import {readAiNews,withAiNews} from './ai-news';
import {aiTemplatesOnly} from './ai-kill-switch';
import {KINDLE_NEWSPAPERS_FLAG,readKindlePlayerArticles} from './kindle-newspapers';
import {flagOn} from './flag-pack.mjs';

export const reportDailyLimit=10;
export const reportNoteMax=280;
export type ReportKind='citizen-message'|'notable-reply'|'ai-leader-address'|'ai-news'|'player-article';
export type ReportResult={status:number;body:Record<string,unknown>};
const kinds:readonly ReportKind[]=['citizen-message','notable-reply','ai-leader-address','ai-news','player-article'];
const looseKind=(kind:string)=>kind==='ai-leader-address'||kind==='ai-news'||kind==='player-article';
const err=(status:number,error:string,extra:Record<string,unknown>={}):ReportResult=>({status,body:{error,...extra}});

/** The daily cap is one conditional upsert on the reporter's day row: a row lock on Postgres and a single writer on D1, so parallel requests cannot pass it.
 *  A slot taken by a report that then loses a uniqueness race is given back. */
const takeSlotSql=`INSERT INTO moderation_report_days(reporter_id,day,reports) VALUES (?,?,1)
ON CONFLICT(reporter_id,day) DO UPDATE SET reports=moderation_report_days.reports+1 WHERE moderation_report_days.reports<?`;
const insertSql=`INSERT INTO moderation_reports(id,request_id,reporter_id,target_kind,target_id,reason_id,note,created_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`;

async function aiNewsVisible(db:GameDatabase,userId:string,nationId:string,targetId:string,now:number){
 const news=await readNationalNews(db,nationId,now*1000,newsEditionOptions(env,userId));if(!news)return false;
 const templated=aiTemplatesOnly(env as {HARIMU_AI_TEMPLATES_ONLY?:unknown},nationId);
 const edition=withAiNews(news,templated?[]:await readAiNews(db,nationId),templated);
 const item=edition.items.find(row=>row.id.toLowerCase()===targetId);
 return item?.source==='model'||item?.source==='deterministic';
}
async function playerArticleVisible(db:GameDatabase,userId:string,nationId:string,targetId:string){
 if(nationId!=='kindle'||!flagOn(env,KINDLE_NEWSPAPERS_FLAG))return false;
 const items=await readKindlePlayerArticles(db,userId,(env as {HARIMU_CHAT_SHADOW_MUTE?:unknown}).HARIMU_CHAT_SHADOW_MUTE);
 return items.some(row=>row.id.toLowerCase()===targetId);
}
async function targetVisible(db:GameDatabase,userId:string,nationId:string,kind:ReportKind,targetId:string,now:number){
 // A chat message is reportable while it is live in the reporter's own nation's square, and not by its author.
 // #881: or live in the city chat of the reporter's own nation and current city (citizen_city_locations, server-side), and not by its author.
 if(kind==='citizen-message')return Boolean(await db.prepare('SELECT 1 AS ok FROM square_messages WHERE id=? AND nation_id=? AND deleted=0 AND user_id<>?').bind(targetId,nationId,userId).first())
  ||Boolean(await db.prepare('SELECT 1 AS ok FROM city_chat_messages m JOIN citizen_city_locations l ON l.user_id=? AND l.nation_id=m.nation_id AND l.current_city_id=m.city_id WHERE m.id=? AND m.nation_id=? AND m.deleted=0 AND m.user_id<>?').bind(userId,targetId,nationId,userId).first())
  // #881 part 2: or live in global chat (open to every enrolled citizen), and not by its author.
  ||Boolean(await db.prepare('SELECT 1 AS ok FROM global_chat_messages WHERE id=? AND deleted=0 AND user_id<>?').bind(targetId,userId).first())
  // #881 part 3: or a live DM the reporter is a party to (not their own).
  ||Boolean(await db.prepare('SELECT 1 AS ok FROM dm_chat_messages WHERE id=? AND deleted=0 AND sender_id<>? AND (sender_id=? OR peer_id=?)').bind(targetId,userId,userId,userId).first())
  // #882: or a live embassy message in a channel the reporter's nation belongs to (not their own).
  ||Boolean(await db.prepare("SELECT 1 AS ok FROM embassy_chat_messages m JOIN citizens c ON c.clerk_user_id=? AND c.nation_id IS NOT NULL WHERE m.id=? AND m.deleted=0 AND m.user_id<>? AND (m.channel_id LIKE c.nation_id || '|%' OR m.channel_id LIKE '%|' || c.nation_id)").bind(userId,targetId,userId).first());
 // #1462: a published weekly address for the reporter's own nation (the same nation gate as readAddressArchive).
 if(kind==='ai-leader-address')return Boolean(await db.prepare('SELECT 1 AS ok FROM weekly_addresses a WHERE a.id=? AND a.nation_id=? AND EXISTS(SELECT 1 FROM citizens WHERE clerk_user_id=? AND nation_id=?)').bind(targetId,nationId,userId,nationId).first());
 // An item already in the reporter's news edition that the edition marks as model-written or deterministic AI-labeled. System records and player articles are not this target.
 if(kind==='ai-news')return aiNewsVisible(db,userId,nationId,targetId,now);
 // A published Kindle article the reporter can read. Human byline: no AI-only reason (checked by the caller).
 if(kind==='player-article')return playerArticleVisible(db,userId,nationId,targetId);
 // A Notable reply is only shown to the citizen who asked, so it must be one of their own Notable requests (the reservation row).
 // Only a finished request showed a reply. The reservation cannot tell a model reply from an authored fallback (both settle to 'finished').
 return Boolean(await db.prepare("SELECT 1 AS ok FROM harimu_ai_reservations WHERE request_id=? AND status='finished'").bind((await ownerPrefix(userId))+targetId).first());
}

export async function submitReport(db:GameDatabase,userId:string,nationId:string,body:Record<string,unknown>,now:number):Promise<ReportResult>{
 const {requestId,targetKind,targetId,reasonId,note}=body;
 if(typeof requestId!=='string'||!uuidPattern.test(requestId))return err(400,'A valid request ID is required.');
 if(typeof targetKind!=='string'||!(kinds as readonly string[]).includes(targetKind))return err(400,'Choose something to report.');
 if(typeof targetId!=='string'||(looseKind(targetKind)?targetId.length<1||targetId.length>80:!uuidPattern.test(targetId)))return err(400,'Choose something to report.');
 const kind=targetKind as ReportKind;
 const reasonOk=typeof reasonId==='string'&&(kind==='player-article'?reportReasons.some(r=>r.id===reasonId&&!r.aiOnly):reasonsFor(kind).some(r=>r.id===reasonId));
 if(!reasonOk)return err(400,'Choose a listed reason.');
 if(note!==undefined&&note!==null&&(typeof note!=='string'||note.trim().length>reportNoteMax))return err(400,`Notes are limited to ${reportNoteMax} characters.`);
 const cleanNote=typeof note==='string'&&note.trim()?note.trim():null;
 const request=requestId.toLowerCase(),target=targetId.toLowerCase();
 const same=(row:{reporter_id:string;target_kind:string;target_id:string;reason_id:string}|null)=>row&&row.reporter_id===userId&&row.target_kind===kind&&row.target_id===target&&row.reason_id===reasonId;
 const prior=await db.prepare('SELECT reporter_id,target_kind,target_id,reason_id FROM moderation_reports WHERE request_id=?').bind(request).first<{reporter_id:string;target_kind:string;target_id:string;reason_id:string}>();
 if(prior)return same(prior)?{status:201,body:{ok:true}}:err(409,'Request already used.');
 if(!await targetVisible(db,userId,nationId,kind,target,now))return err(404,'That item is not available to report.');
 if(await db.prepare('SELECT 1 AS ok FROM moderation_reports WHERE reporter_id=? AND target_kind=? AND target_id=?').bind(userId,kind,target).first())return err(409,'You already reported this.',{duplicate:true});
 const day=Math.floor(now/86400);
 if(!(await db.prepare(takeSlotSql).bind(userId,day,reportDailyLimit).run()).meta.changes)return err(429,`You can send up to ${reportDailyLimit} reports a day.`);
 const result=await db.prepare(insertSql).bind(crypto.randomUUID(),request,userId,kind,target,reasonId as ReportReasonId,cleanNote,now).run();
 if(result.meta.changes)return {status:201,body:{ok:true}};
 await db.prepare('UPDATE moderation_report_days SET reports=reports-1 WHERE reporter_id=? AND day=? AND reports>0').bind(userId,day).run();
 const replay=await db.prepare('SELECT reporter_id,target_kind,target_id,reason_id FROM moderation_reports WHERE request_id=?').bind(request).first<{reporter_id:string;target_kind:string;target_id:string;reason_id:string}>();
 if(replay)return same(replay)?{status:201,body:{ok:true}}:err(409,'Request already used.');
 return err(409,'You already reported this.',{duplicate:true});
}

/** #959: staff list of player reports (docs §21.3). Newest first; limit/offset capped like the AI review queue. Flag HARIMU_REPORTS_ENABLED gates the admin route. */
export type ModerationReportRow={id:string;request_id:string;reporter_id:string;target_kind:string;target_id:string;reason_id:string;note:string|null;created_at:number};
export async function listModerationReports(db:GameDatabase,{limit=50,offset=0}:{limit?:number;offset?:number}={}):Promise<ModerationReportRow[]>{
 const lim=Math.min(Math.max(1,limit|0||50),200),off=Math.max(0,offset|0);
 const rows=await db.prepare('SELECT id,request_id,reporter_id,target_kind,target_id,reason_id,note,created_at FROM moderation_reports ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?').bind(lim,off).all<ModerationReportRow>();
 return rows.results??[];
}
