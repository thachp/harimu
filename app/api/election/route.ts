import {authenticatedUserId} from '@/lib/auth';
import {getDatabase} from '@/lib/db';
import {readVerification} from '@/lib/verification';
import {isSameOriginCommand,readCommandObject} from '@/lib/command-request';
import {validPetitionId} from '@/lib/collective-petitions';
import {validRanking} from '@/lib/instant-runoff';
import {trustedBallotPrivacyReady,ballotPrivacyReason} from '@/lib/ballot-privacy';
import {candidateIds,electionId,openPreviewElection,readElection,voteReceiptSql,anonymousBallotSql,markBallotWrittenSql} from '@/lib/elections';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
const kindle=async(db:D1Database,userId:string)=>(await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{nation_id:string|null}>())?.nation_id==='kindle';
export async function GET(request:Request){
 const userId=await authenticatedUserId(request);if(!userId)return json({error:'Sign in required.'},401);
 const db=await getDatabase();if(!await kindle(db,userId))return json({error:'This preview election is for Kindle citizens only.'},403);
 const verification=await readVerification(userId),now=Math.floor(Date.now()/1000);if(verification.countedActionsEligible)await openPreviewElection(db,userId,now);
 return json({...await readElection(db,userId,now),verification});
}
export async function POST(request:Request){
 if(!isSameOriginCommand(request))return json({error:'Same-origin request required.'},403);
 // While privacy is unreviewed, refuse before authenticating or parsing a ranking.
 if(!trustedBallotPrivacyReady())return json({error:ballotPrivacyReason,privacyReady:false},403);
 const userId=await authenticatedUserId(request);if(!userId)return json({error:'Sign in required.'},401);
 const db=await getDatabase();if(!await kindle(db,userId))return json({error:'This preview election is for Kindle citizens only.'},403);
 const verification=await readVerification(userId);if(!verification.countedActionsEligible)return json({error:verification.reason,verification},403);
 let body:Record<string,unknown>;try{body=await readCommandObject(request,2048);}catch{return json({error:'Expected a bounded ranked-ballot command.'},400);}
 if(body.action!=='vote'||body.electionId!==electionId||!validPetitionId(body.requestId)||!validRanking(body.ranking,candidateIds))return json({error:'Rank all three candidates exactly once and use a valid ballot receipt.'},400);
 const now=Math.floor(Date.now()/1000),requestId=body.requestId;
 const receipt=()=>db.prepare('SELECT election_id,clerk_user_id,ballot_written FROM civic_voter_receipts WHERE request_id=?').bind(requestId).first<{election_id:string;clerk_user_id:string;ballot_written:number}>();
 const prior=await receipt();if(prior){
  if(prior.election_id!==electionId||prior.clerk_user_id!==userId||prior.ballot_written!==1)return json({error:'Ballot receipt already used.'},409);
  return json({ok:true,alreadyRecorded:true,message:'Your original ballot remains recorded. This retry does not edit its ranking.',...await readElection(db,userId,now),verification});
 }
 await openPreviewElection(db,userId,now);
 await db.batch([db.prepare(voteReceiptSql).bind(requestId,now,userId,electionId,now,now),db.prepare(anonymousBallotSql).bind(crypto.randomUUID(),JSON.stringify(body.ranking),requestId,userId,electionId),db.prepare(markBallotWrittenSql).bind(requestId,userId,electionId)]);
 const saved=await receipt();if(!saved||saved.clerk_user_id!==userId||saved.election_id!==electionId||saved.ballot_written!==1)return json({error:'Already voted, voting closed, or citizenship changed. Refresh your ballot status.'},409);
 return json({ok:true,...await readElection(db,userId,now),verification});
}
