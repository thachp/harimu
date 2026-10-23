/** #135: server-side first-week progress, per citizen, surviving reloads and devices.
 * Guidance only: recording a goal never grants rewards or changes game state.
 * - Client-recorded goals: POST {action:'first-week-complete', goalId, requestId}. Accepted only for a goal
 *   in lib/first-week.ts for the citizen's nation, visible (its `requires` are built), on the current or an
 *   earlier arc day. Idempotent.
 * - Event-backed goals: derived from existing ledgers by latchFirstWeekGoals after successful writes
 *   (citizen, square and election POSTs) and latched into the table. GET only reads the table (#194, #205). */
import type {GameDatabase} from './database-contract';
import {firstWeekArcs,visibleGoals,type GoalRequirement,type WeekGoal} from './first-week';
import {citizenRankShifts} from './civic-rank-rules';

export const firstWeekGoalsSchema=`CREATE TABLE IF NOT EXISTS citizen_first_week_goals (clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,goal_id TEXT NOT NULL CHECK(length(goal_id) BETWEEN 1 AND 64),completed_at INTEGER NOT NULL,source TEXT NOT NULL CHECK(source IN ('client','ledger')),PRIMARY KEY(clerk_user_id,goal_id))`;
/** Features built today (same as the client's visibleGoals() default). Add a requirement here when it ships. */
export const firstWeekAvailable:readonly GoalRequirement[]=[];
/** #741: requirements built behind a flag; 'rank-ladder' only while HARIMU_CIVIC_RANK_ENABLED is 'true'. */
export const availableWith=(civicRankOn:boolean):readonly GoalRequirement[]=>civicRankOn?[...firstWeekAvailable,'rank-ladder']:firstWeekAvailable;
const daySec=86400;

type Placed={goal:WeekGoal;day:number};
function arcGoals(nationId:string,available:readonly GoalRequirement[]=firstWeekAvailable):Placed[]{
 const arc=firstWeekArcs.find(a=>a.nationId===nationId);
 return arc?arc.days.flatMap(d=>visibleGoals(d,available).map(goal=>({goal,day:d.day}))):[];
}
/** Arc day (1-based) for a citizen enrolled at `enrolledAt` (ISO), or null if not parseable / in the future. */
export function arcDay(enrolledAt:string,now:number):number|null{
 const enrolled=Date.parse(enrolledAt);if(!Number.isFinite(enrolled)||now*1000<enrolled)return null;
 return Math.floor((now*1000-enrolled)/(daySec*1000))+1;
}
export type GoalCheck={ok:true;day:number}|{ok:false;status:400|403;error:string};
export function checkFirstWeekGoal(nationId:string|null,enrolledAt:string,goalId:unknown,now:number,available:readonly GoalRequirement[]=firstWeekAvailable):GoalCheck{
 if(typeof goalId!=='string'||!/^[a-z0-9-]{1,64}$/.test(goalId))return {ok:false,status:400,error:'Unknown first-week goal.'};
 if(!nationId)return {ok:false,status:403,error:'Enroll in a nation first.'};
 const all=firstWeekArcs.find(a=>a.nationId===nationId)?.days.flatMap(d=>d.goals.map(goal=>({goal,day:d.day})))??[];
 const found=all.find(p=>p.goal.id===goalId);
 if(!found)return {ok:false,status:400,error:'That goal is not part of your nation\u2019s first week.'};
 if(!arcGoals(nationId,available).some(p=>p.goal.id===goalId))return {ok:false,status:403,error:'That goal is not available yet.'};
 const day=arcDay(enrolledAt,now);
 if(day===null||found.day>day)return {ok:false,status:403,error:'That goal unlocks on a later day of your first week.'};
 return {ok:true,day:found.day};
}
export async function completeFirstWeekGoal(db:GameDatabase,userId:string,goalId:string,now:number){
 await db.prepare(`INSERT INTO citizen_first_week_goals(clerk_user_id,goal_id,completed_at,source) SELECT clerk_user_id,?,?,'client' FROM citizens WHERE clerk_user_id=? ON CONFLICT(clerk_user_id,goal_id) DO NOTHING`).bind(goalId,now,userId).run();
}

/** Event-backed derivations: goal id pattern -> SQL counting matching ledger rows in [start,end) seconds. */
const iso=(sec:number)=>new Date(sec*1000).toISOString();
type Probe={match:(g:WeekGoal)=>boolean;sql:string;bind:(u:string,s:number,e:number)=>unknown[]};
const probes:Probe[]=[
 {match:g=>g.id==='kindle-7-rank',sql:`SELECT CASE WHEN COUNT(*)>=${citizenRankShifts} THEN 1 ELSE 0 END AS n FROM work_shifts WHERE clerk_user_id=? AND claimed_at IS NOT NULL AND claimed_at<?`,bind:(u,_s,e)=>[u,iso(e)]} /* #741: rank Citizen or above by the end of day 7 */,
 {match:g=>g.id==='kindle-6-shift',sql:`SELECT COUNT(*) AS n FROM work_shifts WHERE clerk_user_id=? AND claimed_at>=? AND claimed_at<? AND (lower(order_name) LIKE '%freight%' OR lower(order_name) LIKE '%archive%')`,bind:(u,s,e)=>[u,iso(s),iso(e)]},
 {match:g=>/^kindle-\d-shift$/.test(g.id)&&/second/i.test(g.signal),sql:`SELECT CASE WHEN (SELECT COUNT(*) FROM work_shifts WHERE clerk_user_id=? AND claimed_at IS NOT NULL AND claimed_at<?)>=2 THEN (SELECT COUNT(*) FROM work_shifts WHERE clerk_user_id=? AND claimed_at>=? AND claimed_at<?) ELSE 0 END AS n`,bind:(u,s,e)=>[u,iso(e),u,iso(s),iso(e)]},
 {match:g=>/^kindle-\d-shift$/.test(g.id),sql:`SELECT COUNT(*) AS n FROM work_shifts WHERE clerk_user_id=? AND claimed_at>=? AND claimed_at<?`,bind:(u,s,e)=>[u,iso(s),iso(e)]},
 {match:g=>g.id==='kindle-2-sell',sql:`SELECT COUNT(*) AS n FROM citizen_economy_events WHERE clerk_user_id=? AND kind='sell' AND occurred_at>=? AND occurred_at<?`,bind:(u,s,e)=>[u,s,e]},
 {match:g=>g.id==='kindle-4-meal',sql:`SELECT COUNT(*) AS n FROM citizen_economy_events WHERE clerk_user_id=? AND kind='meal' AND occurred_at>=? AND occurred_at<?`,bind:(u,s,e)=>[u,s,e]},
 {match:g=>/-square$/.test(g.id),sql:`SELECT COUNT(*) AS n FROM square_messages WHERE user_id=? AND posted_at>=? AND posted_at<?`,bind:(u,s,e)=>[u,s,e]},
 {match:g=>g.id==='kindle-5-ballot',sql:`SELECT (SELECT COUNT(*) FROM civic_voter_receipts WHERE clerk_user_id=? AND ballot_written=1 AND checked_at>=? AND checked_at<?)+(SELECT COUNT(*) FROM poc_voter_receipts WHERE clerk_user_id=? AND ballot_written=1 AND checked_at>=? AND checked_at<?) AS n`,bind:(u,s,e)=>[u,s,e,u,s,e]} /* #205: Tier-1 and account-preview ballots */,
 {match:g=>g.id==='kindle-6-trade',sql:`SELECT COUNT(*) AS n FROM player_fills WHERE (buyer_id=? OR seller_id=?) AND filled_at>=? AND filled_at<?`,bind:(u,s,e)=>[u,u,s,e]},
 {match:g=>g.id==='korund-3-queue',sql:`SELECT COUNT(*) AS n FROM korund_ration_queue WHERE clerk_user_id=? AND joined_at>=? AND joined_at<?`,bind:(u,s,e)=>[u,s,e]},
 {match:g=>/^korund-\d-coupons$/.test(g.id),sql:`SELECT COUNT(*) AS n FROM korund_coupon_redemptions WHERE clerk_user_id=? AND occurred_at>=? AND occurred_at<?`,bind:(u,s,e)=>[u,s,e]},
];
export const derivableGoal=(goal:WeekGoal)=>probes.some(p=>p.match(goal));

/** Completed goal ids for the citizen. Read-only (#194): GET never derives or writes; write paths latch. */
export async function readFirstWeekProgress(db:GameDatabase,userId:string):Promise<{completed:string[]}>{
 const rows=(await db.prepare('SELECT goal_id FROM citizen_first_week_goals WHERE clerk_user_id=?').bind(userId).all<{goal_id:string}>()).results??[];
 return {completed:rows.map(r=>r.goal_id).sort()};
}

/** Derive event-backed goals from the ledgers and latch them (source='ledger'). Called after successful
 *  writes that can create evidence (shift claim, sell/meal, trade, Korund queue/coupons, square post, ballot). */
export async function latchFirstWeekGoals(db:GameDatabase,userId:string,now:number,available:readonly GoalRequirement[]=firstWeekAvailable):Promise<string[]>{
 const citizen=await db.prepare('SELECT nation_id,created_at FROM citizens WHERE clerk_user_id=?').bind(userId).first<{nation_id:string|null;created_at:string}>();
 if(!citizen?.nation_id)return [];
 const today=arcDay(citizen.created_at,now);if(today===null)return [];
 const stored=new Set((await readFirstWeekProgress(db,userId)).completed);const enrolled=Math.floor(Date.parse(citizen.created_at)/1000);const latched:string[]=[];
 for(const {goal,day} of arcGoals(citizen.nation_id,available)){
  if(stored.has(goal.id)||day>today)continue;
  const probe=probes.find(p=>p.match(goal));if(!probe)continue;
  const start=enrolled+(day-1)*daySec,end=start+daySec;
  let row:{n:number}|null=null;
  try{row=await db.prepare(probe.sql).bind(...probe.bind(userId,start,end)).first<{n:number}>();}catch{continue;/* #205: one unavailable ledger never blocks the others */}
  if(Number(row?.n??0)>0){
   await db.prepare(`INSERT INTO citizen_first_week_goals(clerk_user_id,goal_id,completed_at,source) VALUES (?,?,?,'ledger') ON CONFLICT(clerk_user_id,goal_id) DO NOTHING`).bind(userId,goal.id,now).run();
   stored.add(goal.id);latched.push(goal.id);
  }
 }
 return latched;
}

/** Best-effort latch after a successful write; never fails the write's response. */
export async function latchAfterWrite(db:GameDatabase,response:Response,userIds:readonly (string|null|undefined)[],now:number,available:readonly GoalRequirement[]=firstWeekAvailable):Promise<Response>{
 if(!response.ok)return response;
 for(const id of new Set(userIds.filter((u):u is string=>Boolean(u)))){try{await latchFirstWeekGoals(db,id,now,available);}catch{/* guidance only */}}
 return response;
}
