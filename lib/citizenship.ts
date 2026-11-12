import { isMissingRelation } from './db-errors.ts';
import type { GameDatabase } from './database-contract';

export const citizenshipGraceMs=48*60*60*1000;
/** #1339: docs §5.2. Off, the five newer sources below are not consulted. A direct string wins over the gray pack. */
export const graceAllPoliticalActionsFlag='HARIMU_GRACE_ALL_POLITICAL_ACTIONS_ENABLED';
type CitizenshipRecord={nation_id:string|null;created_at:string;nation_changes:number};
export function validEnrollmentExpectation(body:Record<string,unknown>):boolean {
 return Object.hasOwn(body,'expectedNationId') && (body.expectedNationId===null || (typeof body.expectedNationId==='string' && body.expectedNationId.length>0));
}
export function citizenshipStatus(profile:CitizenshipRecord,politicalActionTaken:boolean,nowMs=Date.now()) {
 const enrolled=Date.parse(profile.created_at);
 const validTime=Number.isFinite(enrolled)&&Number.isFinite(nowMs)&&enrolled<=nowMs;
 const graceEndsAt=validTime?new Date(enrolled+citizenshipGraceMs).toISOString():null;
 const validCounter=Number.isInteger(profile.nation_changes)&&profile.nation_changes>=0;
 const changeUsed=!validCounter||profile.nation_changes>=1;
 const lockedReason=politicalActionTaken?'political-action':changeUsed?'change-used':!validTime||nowMs>=enrolled+citizenshipGraceMs?'grace-expired':null;
 return {enrolledAt:profile.created_at,graceEndsAt,changesRemaining:changeUsed?0:1,politicalActionTaken,
 canChange:Boolean(profile.nation_id)&&lockedReason===null,lockedReason};
}
// A first enrollment cannot overwrite another command's winning choice.
export const enrollmentInitialSql=`INSERT OR IGNORE INTO citizens
 (clerk_user_id,nation_id,nation_changes,capacity,influence,standing,created_at,updated_at)
 VALUES (?,?,0,18,1240,'Good standing',?,?)`;
export const enrollmentFirstSql=`UPDATE citizens SET nation_id=?,created_at=?,updated_at=?
 WHERE clerk_user_id=? AND nation_id IS NULL`;
type PoliticalSource={sql:string;table?:string};
/** Older civic tables. Created for every database. */
const corePoliticalSources:PoliticalSource[]=[
 {sql:'SELECT 1 FROM citizen_decisions WHERE clerk_user_id=? LIMIT 1'},
 {sql:'SELECT 1 FROM government_petitions WHERE clerk_user_id=? LIMIT 1'},
 {sql:'SELECT 1 FROM civic_petition_signatures WHERE clerk_user_id=? LIMIT 1'},
 {sql:'SELECT 1 FROM civic_voter_receipts WHERE clerk_user_id=? AND ballot_written=1 LIMIT 1'},
 {sql:'SELECT 1 FROM poc_voter_receipts WHERE clerk_user_id=? AND ballot_written=1 LIMIT 1'},
];
/** Docs §5.2 sources whose tables exist only with their own feature. A written ballot matches the civic receipts.
 *  Party membership and congregation office are the current row only (leaving removes it). */
const extraPoliticalSources:PoliticalSource[]=[
 {table:'assembly_voter_receipts',sql:'SELECT 1 FROM assembly_voter_receipts WHERE clerk_user_id=? AND ballot_written=1 LIMIT 1'},
 {table:'primary_voter_receipts',sql:'SELECT 1 FROM primary_voter_receipts WHERE clerk_user_id=? AND ballot_written=1 LIMIT 1'},
 {table:'aurelle_pledges',sql:'SELECT 1 FROM aurelle_pledges WHERE clerk_user_id=? LIMIT 1'},
 {table:'party_members',sql:'SELECT 1 FROM party_members WHERE clerk_user_id=? LIMIT 1'},
 {table:'congregation_officiants',sql:'SELECT 1 FROM congregation_officiants WHERE user_id=? LIMIT 1'},
];
/** One list for the grace-period read and the guarded nation-change write. */
export function gracePoliticalSources(enabled:boolean):PoliticalSource[] {
 return enabled?[...corePoliticalSources,...extraPoliticalSources]:[...corePoliticalSources];
}
/** The missing table named by SQLite ("no such table") or Postgres (42P01 "relation … does not exist"). */
function missingTableName(error:unknown):string|null {
 if(!isMissingRelation(error))return null;
 const message=String((error as {message?:unknown})?.message??error);
 const named=/no such table: (\w+)|relation "([\w.]+)" does not exist/i.exec(message);
 const raw=named?.[1]??named?.[2];
 return raw?raw.split('.').pop()??null:null;
}
/** Drop the one optional source that error names. A missing core table, or any other error, is not swallowed. */
function withoutMissingTable(error:unknown,sources:PoliticalSource[]):PoliticalSource[]|null {
 const table=missingTableName(error);
 if(!table)return null;
 const index=sources.findIndex(source=>source.table===table);
 return index<0?null:sources.filter((_,i)=>i!==index);
}
async function withPresentSources<T>(db:GameDatabase,enabled:boolean,run:(sources:PoliticalSource[])=>Promise<T>):Promise<T> {
 let sources=gracePoliticalSources(enabled);
 for(;;){
  try{return await run(sources);}
  catch(error){const next=withoutMissingTable(error,sources);if(!next)throw error;sources=next;}
 }
}
export function politicalActionReadSql(sources:PoliticalSource[]):string {
 return `SELECT EXISTS(${sources.map(source=>source.sql.replace(/ LIMIT 1$/,'')).join(' UNION ALL ')} LIMIT 1) AS political_action_taken`;
}
export function enrollmentChangeSqlFor(sources:PoliticalSource[]):string {
 return `UPDATE citizens SET nation_id=?,nation_changes=nation_changes+1,updated_at=?
 WHERE clerk_user_id=? AND nation_id=? AND nation_id!=? AND nation_changes=0
 AND julianday(created_at)<=julianday(?)
 AND julianday(created_at,'+48 hours')>julianday(?)${sources.map(source=>`\n AND NOT EXISTS(${source.sql})`).join('')}`;
}
// All eligibility and the nation the citizen reviewed are checked in the write. Flag off is this statement.
export const enrollmentChangeSql=enrollmentChangeSqlFor(corePoliticalSources);
/** #1339: a missing optional table counts as no action and is omitted, then the same statement is retried. */
export async function gracePoliticalActionTaken(db:GameDatabase,userId:string,enabled:boolean):Promise<boolean> {
 return withPresentSources(db,enabled,async sources=>{
  const row=await db.prepare(politicalActionReadSql(sources)).bind(...sources.map(()=>userId)).first<{political_action_taken:number}>();
  return Boolean(row?.political_action_taken);
 });
}
export async function runGraceEnrollmentChange(db:GameDatabase,enabled:boolean,nationId:string,now:string,userId:string,expectedNationId:unknown):Promise<void> {
 await withPresentSources(db,enabled,sources=>db.prepare(enrollmentChangeSqlFor(sources))
  .bind(nationId,now,userId,expectedNationId,nationId,now,now,...sources.map(()=>userId)).run());
}
