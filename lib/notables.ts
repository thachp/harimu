import type {GameDatabase} from './database-contract';
import {publicNewsFacts,validatedNewsDraft,newsDraftText,type NewsAiBinding} from './ai-news';
import {reserveAiSequence,type AiModel} from './ai-budget';
import {readNationalNews} from './national-news';
import {notableProfile,notableTopics,notableDailyLimit,validNotableCommand,type NotableTopic} from './notable-profiles';
export {notableProfile,notableTopics,notableDailyLimit,validNotableCommand} from './notable-profiles';
export const notablesEnabled=false; // Separate live-conversation activation remains unapproved.
async function ownerPrefix(userId:string){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(userId));return 'notable:'+Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('')+':';}
function responseText(value:unknown){if(!value||typeof value!=='object')throw Error();const r=value as {response?:unknown;finish_reason?:unknown;usage?:{completion_tokens?:unknown}};if(typeof r.response!=='string'||(r.finish_reason!==undefined&&r.finish_reason!=='stop')||(typeof r.usage?.completion_tokens==='number'&&r.usage.completion_tokens>=256))throw Error();return r.response;}
/** No conversation history, household drafts, account IDs or private chat enter a model prompt. */
export async function answerNotable(db:GameDatabase,userId:string,command:{requestId:string;notableId:string;topic:NotableTopic},now:number,binding:NewsAiBinding|undefined,{enabled=false,priceReviewedUntil=0}={}){
 const fail=(status:number,error:string)=>({status,error});
 if(!validNotableCommand(command))return fail(400,'Choose a listed public topic and a valid request.');
 const citizen=await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{nation_id:string}>();const profile=notableProfile(citizen?.nation_id??null);
 if(!profile||profile.id!==command.notableId)return fail(403,'Only your nation’s Notable is available.');
 if(!enabled||!binding)return fail(503,'AI conversations are disabled. Authored topic examples remain available.');
 const prefix=await ownerPrefix(userId),id=prefix+command.requestId.toLowerCase();
 if(await db.prepare('SELECT request_id FROM harimu_ai_reservations WHERE request_id=?').bind(id).first())return fail(409,'This request was already attempted. Repeating it makes no further inference call.');
 const news=await readNationalNews(db,citizen!.nation_id,now*1000);if(!news)return fail(503,'Public context is unavailable.');const facts=publicNewsFacts(news);
 if(!await reserveAiSequence(db,id,now,priceReviewedUntil,{ownerPrefix:prefix,dailyLimit:notableDailyLimit}))return fail(429,'The equal daily limit or shared inference budget is unavailable.');
 let uncertain=false,failureCode='validation';
 const call=async(model:AiModel,messages:{role:'system'|'user'|'assistant';content:string}[])=>{let timer:ReturnType<typeof setTimeout>|undefined;try{if(new TextEncoder().encode(JSON.stringify(messages)).length>12000)throw Error();return responseText(await Promise.race([binding.run(model,{messages,max_tokens:256,temperature:0,stream:false}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error()),30000);})]));}catch(error){uncertain=true;failureCode=error&&typeof error==='object'&&(('code' in error&&String(error.code)==='5016')||('message' in error&&typeof error.message==='string'&&/\b5016\b/.test(error.message)))?`model-terms-5016:${model}`:'inference-uncertain';throw Error();}finally{if(timer!==undefined)clearTimeout(timer);}};
 try{
  const context={persona:profile.persona,question:notableTopics[command.topic].question,facts};
  const raw=await call('@cf/meta/llama-3.2-3b-instruct',[{role:'system',content:'Answer this public topic in character, using only public facts. Return JSON with title, summary and claims containing only citizens, completedShifts, food. Do not use numbers or quantitative words in prose, invent rumors, disclose secrets, offer an economic advantage, or claim this conversation changes the game. Numeric facts are rendered by the server.'},{role:'user',content:JSON.stringify(context)}]);
  const draft=validatedNewsDraft(JSON.parse(raw));if(!draft)throw Error();
  const verified=await call('@cf/meta/llama-3.2-3b-instruct',[{role:'system',content:'Compare the answer with public facts. Reply exactly supported only if it makes no unsupported claims, invented rumor, private disclosure, or claim to change a game outcome. Otherwise reply unsupported.'},{role:'user',content:JSON.stringify({facts,draft})}]);if(verified.trim()!=='supported')throw Error();
  const safe=await call('@cf/meta/llama-guard-3-8b',[{role:'user',content:JSON.stringify(context)},{role:'assistant',content:JSON.stringify(draft)}]);if(safe.trim()!=='safe')throw Error();
  const current=await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{nation_id:string}>();if(current?.nation_id!==citizen!.nation_id)throw Error();
  await db.prepare("UPDATE harimu_ai_reservations SET status='finished' WHERE request_id=?").bind(id).run();return {status:200,reply:newsDraftText(draft,facts),source:'model' as const};
 }catch{await db.prepare('UPDATE harimu_ai_reservations SET status=? WHERE request_id=?').bind(uncertain?'uncertain':'finished',id).run();return {...fail(503,'No response was published. The attempted request remains charged; it will not be retried automatically.'),failureCode};}
}
