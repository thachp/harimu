import type {GameDatabase} from '@/lib/database-contract';
import {authenticatedUserId} from '@/lib/auth';
import {getDatabase} from '@/lib/db';
import {readVerification} from '@/lib/verification';
import {isSameOriginCommand,readCommandObject} from '@/lib/command-request';
import {createCollectivePetitionSql,signCollectivePetitionSql,latchCollectiveThresholdSql,readCollectivePetitions,recordVerifiedHumanVisit,petitionWindowSeconds,validPetitionId,validPetitionText} from '@/lib/collective-petitions';
import {env,waitUntil} from 'cloudflare:workers';
import {aiBudgetConfig} from '@/lib/ai-budget';
import {prepareAiCabinetResponse} from '@/lib/cabinet-response-ai';
import type {NewsAiBinding} from '@/lib/ai-news';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
async function citizen(db:GameDatabase,userId:string){return await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{nation_id:string|null}>();}
export async function GET(request:Request){
 const userId=await authenticatedUserId(request);if(!userId)return json({error:'Sign in required.'},401);
 const db=await getDatabase();if((await citizen(db,userId))?.nation_id!=='kindle')return json({error:'Collective petitions are available to Kindle citizens only.'},403);
 const verification=await readVerification(userId);const now=Math.floor(Date.now()/1000);
 if(verification.countedActionsEligible)await recordVerifiedHumanVisit(db,userId,now);
 const bindings=env as unknown as {AI?:NewsAiBinding;HARIMU_AI_CABINET_RESPONSES_ENABLED?:string;HARIMU_AI_DAILY_BUDGET_MICRO?:string;HARIMU_AI_GATEWAY_ID?:string};
 const budget=aiBudgetConfig(bindings),cabinetResponses=bindings.HARIMU_AI_CABINET_RESPONSES_ENABLED==='true'&&Boolean(bindings.AI)&&budget!==null;
 // Mandatory response: a reached petition triggers the gated AI Cabinet reply in the background, never blocking this read.
 if(cabinetResponses)waitUntil(prepareAiCabinetResponse(db,now,bindings.AI,{enabled:true,budget}).catch(()=>undefined));
 return json({...await readCollectivePetitions(db,userId,now),verification,cabinetResponses});
}
export async function POST(request:Request){
 if(!isSameOriginCommand(request))return json({error:'Same-origin request required.'},403);
 const userId=await authenticatedUserId(request);if(!userId)return json({error:'Sign in required.'},401);
 let body:Record<string,unknown>;try{body=await readCommandObject(request,4096);}catch{return json({error:'Expected a bounded JSON command.'},400);}
 if(!['create','sign'].includes(String(body.action))||!validPetitionId(body.requestId)||body.action==='create'&&(!validPetitionText(body.title,5,100)||!validPetitionText(body.demand,10,1000))||body.action==='sign'&&!validPetitionId(body.petitionId))return json({error:'Use a valid request identifier, title (5–100 characters) and demand (10–1000 characters).'},400);
 const db=await getDatabase();if((await citizen(db,userId))?.nation_id!=='kindle')return json({error:'Collective petitions are available to Kindle citizens only.'},403);
 const verification=await readVerification(userId);if(!verification.countedActionsEligible)return json({error:verification.reason,verification},403);
 const now=Math.floor(Date.now()/1000),kind=body.action as 'create'|'sign',id=(kind==='create'?body.requestId:body.petitionId) as string,requestId=body.requestId as string;
 const receipt=()=>db.prepare('SELECT petition_id,clerk_user_id,kind FROM civic_petition_signatures WHERE request_id=?').bind(requestId).first<{petition_id:string;clerk_user_id:string;kind:string}>();
 const prior=await receipt();
 if(prior){
  if(prior.clerk_user_id!==userId||prior.petition_id!==id||prior.kind!==kind)return json({error:'Request identifier already used.'},409);
  if(kind==='create'){const original=await db.prepare('SELECT title,demand FROM civic_petitions WHERE id=?').bind(id).first<{title:string;demand:string}>();if(original?.title!==body.title||original?.demand!==body.demand)return json({error:'Retry the original petition without editing it.'},409);}
  return json({ok:true,...await readCollectivePetitions(db,userId,now),verification});
 }
 await recordVerifiedHumanVisit(db,userId,now);
 const statements=[];
 if(kind==='create'){
  statements.push(db.prepare(createCollectivePetitionSql).bind(id,body.title,body.demand,now,now,now-petitionWindowSeconds,now,userId,now,requestId));
 }
 statements.push(db.prepare(signCollectivePetitionSql).bind(requestId,kind,now,userId,id,now,now,kind),db.prepare(latchCollectiveThresholdSql).bind(now,id,now,now));
 await db.batch(statements);
 const saved=await receipt();if(!saved||saved.clerk_user_id!==userId||saved.petition_id!==id||saved.kind!==kind)return json({error:kind==='create'?'You already have a petition within its seven-real-day window, or citizenship changed.':'Already signed, expired, threshold reached, or citizenship changed. Refresh the petition list.'},409);
 if(kind==='create'){const original=await db.prepare('SELECT title,demand FROM civic_petitions WHERE id=?').bind(id).first<{title:string;demand:string}>();if(original?.title!==body.title||original?.demand!==body.demand)return json({error:'Retry the original petition without editing it.'},409);}
 return json({ok:true,...await readCollectivePetitions(db,userId,now),verification});
}
