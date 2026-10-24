import {env} from 'cloudflare:workers';
import {accountElectionEnabled,accountElectionDatabase,accountIdFor} from '@/lib/preview-election';
import type {GameDatabase} from '@/lib/database-contract';
import {authenticatedUserId} from '@/lib/auth';
import {getDatabase} from '@/lib/db';
import {readVerification} from '@/lib/verification';
import {latchAfterWrite} from '@/lib/first-week-server';
import {isSameOriginCommand,readCommandObject} from '@/lib/command-request';
import {validPetitionId} from '@/lib/collective-petitions';
import {validRanking} from '@/lib/instant-runoff';
import {trustedBallotPrivacyReady,ballotPrivacyReason} from '@/lib/ballot-privacy';
import {generalElectionSlate,type PrimaryBindings} from '@/lib/primaries';
import {presidentialCycle,presidentialWindow,type CalendarBindings} from '@/lib/election-calendars';
import {candidateIds,electionIdFor,openPreviewElection,readElection,voteReceiptSql,anonymousBallotSql,markBallotWrittenSql} from '@/lib/elections';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
const preview=()=>accountElectionEnabled(env as unknown as {NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW?:string;HARIMU_ACCOUNT_ELECTION_POC_ENABLED?:string});
// #936: the election row of the latest opened window (one row per cycle); held or before day 30: the original id.
const cycleId=(now:number)=>electionIdFor(presidentialCycle(env as unknown as CalendarBindings,now));
const kindle=async(db:GameDatabase,userId:string)=>(await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{nation_id:string|null}>())?.nation_id==='kindle';
export async function GET(request:Request){
 const userId=await authenticatedUserId(request);if(!userId)return json({error:'Sign in required.'},401);
 const accountLevel=preview(),raw=await getDatabase(),db=accountLevel?accountElectionDatabase(raw):raw;if(!await kindle(db,userId))return json({error:'This preview election is for Kindle citizens only.'},403);
 const verification=await readVerification(userId),now=Math.floor(Date.now()/1000),cid=cycleId(now);
 // #221: read-only. The election opens on POST (and citizen POSTs); a due close/count is recorded by POST and the world tick.
 // #307: with HARIMU_PRIMARIES_ENABLED off this reads nothing and returns today's candidates.
 const general=await generalElectionSlate(raw,env as unknown as PrimaryBindings,now);
 return json({...await readElection(db,userId,now,accountLevel||trustedBallotPrivacyReady(),accountLevel||verification.countedActionsEligible,true,general.slate,general.blocked,presidentialWindow(env as unknown as CalendarBindings,now),cid),id:accountLevel?accountIdFor(cid):cid,electionEligibility:{eligible:accountLevel||verification.countedActionsEligible,scope:accountLevel?'preview-citizen':'tier1',reason:accountLevel?'Signed-in Kindle citizens may vote once in this preview PoC.':verification.reason},verification});
}
// #194: a written ballot can complete a first-week goal; latch after a successful vote.
export async function POST(request:Request){
 const response=await handleVote(request);if(!response.ok)return response;
 const userId=await authenticatedUserId(request);if(!userId)return response;
 return latchAfterWrite(await getDatabase(),response,[userId],Math.floor(Date.now()/1000));
}
async function handleVote(request:Request){
 if(!isSameOriginCommand(request))return json({error:'Same-origin request required.'},403);
 // While privacy is unreviewed, refuse before authenticating or parsing a ranking.
 if(!preview()&&!trustedBallotPrivacyReady())return json({error:ballotPrivacyReason,privacyReady:false},403);
 const userId=await authenticatedUserId(request);if(!userId)return json({error:'Sign in required.'},401);
 const accountLevel=preview(),raw=await getDatabase(),db=accountLevel?accountElectionDatabase(raw):raw;if(!await kindle(db,userId))return json({error:'This preview election is for Kindle citizens only.'},403);
 const verification=await readVerification(userId);if(!accountLevel&&!verification.countedActionsEligible)return json({error:verification.reason,verification},403);
 let body:Record<string,unknown>;try{body=await readCommandObject(request,2048);}catch{return json({error:'Expected a bounded ranked-ballot command.'},400);}
 const cid=cycleId(Math.floor(Date.now()/1000)),pub=accountLevel?accountIdFor(cid):cid;
 if(body.action!=='vote'||body.electionId!==pub||!validPetitionId(body.requestId)||!validRanking(body.ranking,candidateIds))return json({error:'Rank all three candidates exactly once and use a valid ballot receipt.'},400);
 const now=Math.floor(Date.now()/1000),requestId=body.requestId;
 const general=await generalElectionSlate(raw,env as unknown as PrimaryBindings,now);
 if(general.blocked)return json({error:'The party primary has not closed. The general ballot opens with one nominee per party.'},409);
 const receipt=()=>db.prepare('SELECT election_id,clerk_user_id,ballot_written FROM civic_voter_receipts WHERE request_id=?').bind(requestId).first<{election_id:string;clerk_user_id:string;ballot_written:number}>();
 const prior=await receipt();if(prior){
  if(prior.election_id!==pub||prior.clerk_user_id!==userId||prior.ballot_written!==1)return json({error:'Ballot receipt already used.'},409);
  return json({ok:true,alreadyRecorded:true,message:'Your original ballot remains recorded. This retry does not edit its ranking.',...await readElection(db,userId,now,accountLevel||trustedBallotPrivacyReady(),false,false,general.slate,false,undefined,cid),id:pub,electionEligibility:{eligible:accountLevel||verification.countedActionsEligible,scope:accountLevel?'preview-citizen':'tier1',reason:accountLevel?'Signed-in Kindle citizens may vote once in this preview PoC.':verification.reason},verification});
 }
 // #918: the vote opens only inside the calendar window (day 30 + k*120, 72 h); held when HARIMU_KINDLE_CYCLE_START_AT is unset or malformed.
 await openPreviewElection(db,userId,now,accountLevel||trustedBallotPrivacyReady(),general.slate,presidentialWindow(env as unknown as CalendarBindings,now)?.opensAt??null,cid);
 await db.batch([db.prepare(voteReceiptSql).bind(requestId,now,userId,cid,now,now),db.prepare(anonymousBallotSql).bind(crypto.randomUUID(),JSON.stringify(body.ranking),requestId,userId,cid),db.prepare(markBallotWrittenSql).bind(requestId,userId,cid)]);
 const saved=await receipt();if(!saved||saved.clerk_user_id!==userId||saved.election_id!==pub||saved.ballot_written!==1)return json({error:'Already voted, voting closed, or citizenship changed. Refresh your ballot status.'},409);
 return json({ok:true,...await readElection(db,userId,now,accountLevel||trustedBallotPrivacyReady(),false,false,general.slate,false,undefined,cid),id:pub,electionEligibility:{eligible:accountLevel||verification.countedActionsEligible,scope:accountLevel?'preview-citizen':'tier1',reason:accountLevel?'Signed-in Kindle citizens may vote once in this preview PoC.':verification.reason},verification});
}
