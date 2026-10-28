import type {GameDatabase} from './database-contract';
import {deniedAiText} from './ai-denylist';
import type {NationalNews,NewsItem} from './national-news';
import {skipForMutedPersona,aiPathPersonas,skipForTemplates,type AiTemplatesOnlyEnv} from './ai-kill-switch';
import {reserveAiSequence,releaseAiReservation,markAiReservationSent,settleAiReservation,markAiReservationUncertain,meteredAiCost,aiBudgetSchema,aiGatewayOptions,type AiModel,type AiMeteredCall,type AiBudgetConfig} from './ai-budget';
export const aiNewsEnabled=true; // Preview activation approved 2026-10-14; runtime flags and pricing expiry still gate inference.
export const aiNewsSchemas=[aiBudgetSchema,
 `CREATE TABLE IF NOT EXISTS ai_news_jobs(id TEXT PRIMARY KEY,nation_id TEXT NOT NULL CHECK(nation_id IN ('kindle','korund','aurelle')),utc_day TEXT NOT NULL,started_at INTEGER NOT NULL,status TEXT NOT NULL CHECK(status IN ('running','published','failed')),failure_code TEXT)`,
 `CREATE TABLE IF NOT EXISTS ai_news_articles(id TEXT PRIMARY KEY,nation_id TEXT NOT NULL CHECK(nation_id IN ('kindle','korund','aurelle')),title TEXT NOT NULL,body TEXT NOT NULL,created_at INTEGER NOT NULL,model TEXT NOT NULL,facts_json TEXT NOT NULL)`,
] as const;
export type NewsAiBinding={run:(model:string,input:{messages:{role:'system'|'user'|'assistant';content:string}[];max_tokens:number;temperature:number;stream:false;response_format?:typeof newsDraftResponseFormat|typeof newsVerificationResponseFormat},options?:{gateway:{id:string}})=>Promise<unknown>};
class AiNewsFailure extends Error{constructor(readonly code:string){super('AI news unavailable.');}}
type Facts={nationId:string;citizens:number;completedShifts:number;food:number};
type Draft={title:string;summary:string;claims:('citizens'|'completedShifts'|'food')[]};
export function publicNewsFacts(news:NationalNews):Facts{
 if(!['kindle','korund','aurelle'].includes(news.nationId))throw Error('Unsupported edition.');
 const {citizens,completedShifts,food}=news.statistics;if([citizens,completedShifts,food].some(n=>!Number.isSafeInteger(n)||n<0))throw Error('Invalid public facts.');
 return {nationId:news.nationId,citizens,completedShifts,food};
}
// #658 follow-up: with digits banned, the model wrote placeholder phrases such as 'a total of citizens'. Reject them.
const danglingQuantity=/\b(?:a|the)\s+total\s+of\b|\btotal(?:s|ing)?\s+(?:of\s+)?(?:registered\s+)?(?:citizens|shifts|food)\b|\ba\s+(?:number|count|sum|amount)\s+of\b/iu;
const quantitative=/\p{Number}|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|dozen|half|double|triple|twice|percent|majority|minority|everyone|all|many|most|more|less|fewer|higher|lower)\b/iu;
export function validatedNewsDraft(value:unknown):Draft|null{
 if(!value||typeof value!=='object')return null;const d=value as Record<string,unknown>;
 if(typeof d.title!=='string'||typeof d.summary!=='string'||!d.title.trim()||!d.summary.trim()||d.title.length>100||d.summary.length>500||quantitative.test(d.title+' '+d.summary)||danglingQuantity.test(d.title+' '+d.summary)||/[<>\[\]{}]/.test(d.title+d.summary)||deniedAiText(d.title+'\n'+d.summary)!==null||!Array.isArray(d.claims)||d.claims.length<1||d.claims.length>3||new Set(d.claims).size!==d.claims.length||d.claims.some(v=>typeof v!=='string'||!['citizens','completedShifts','food'].includes(v)))return null;
 return {title:d.title.trim(),summary:d.summary.trim(),claims:d.claims as Draft['claims']};
}
export function validatedNewsIntroduction(value:unknown){const draft=validatedNewsDraft(value);return draft&&/[.!?]$/.test(draft.summary)?draft:null;}
export function newsDraftText(draft:Draft,facts:Facts){
 const labels={citizens:'registered citizens',completedShifts:'completed paid shifts',food:facts.nationId==='kindle'?'food earned by citizens':'food contributed to public supply'};
 // Numeric statements are rendered from ledger values, never supplied by a model.
 return draft.summary+'\n'+draft.claims.map(key=>`${facts[key]} ${labels[key]}`).join('. ')+'.';
}
export const newsDraftResponseFormat={type:'json_schema',json_schema:{type:'object',additionalProperties:false,required:['title','summary','claims'],properties:{title:{type:'string',maxLength:100},summary:{type:'string',maxLength:500},claims:{type:'array',minItems:1,maxItems:3,items:{type:'string',enum:['citizens','completedShifts','food']}}}}} as const;
export const newsVerificationResponseFormat={type:'json_schema',json_schema:{type:'object',additionalProperties:false,required:['supported'],properties:{supported:{type:'boolean'}}}} as const;
export function supportedNewsDraft(raw:string){if(raw.trim()==='supported')return true;try{const value=JSON.parse(raw);return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===1&&value.supported===true;}catch{return false;}}
export function inferenceText(value:unknown,json=false){
 if(!value||typeof value!=='object')throw Error('Invalid inference response.');
 const r=value as {response?:unknown;finish_reason?:unknown;choices?:{finish_reason?:unknown}[];usage?:{completion_tokens?:unknown}};
 if((r.finish_reason!==undefined&&r.finish_reason!=='stop')||r.choices?.some(c=>c.finish_reason!==undefined&&c.finish_reason!=='stop')||(typeof r.usage?.completion_tokens==='number'&&r.usage.completion_tokens>=256))throw Error('Incomplete inference response.');
 if(typeof r.response==='string')return r.response;
 if(json&&r.response&&typeof r.response==='object'&&!Array.isArray(r.response))return JSON.stringify(r.response);
 throw Error('Invalid inference response.');
}
/** A 'running' news lease older than this died mid-run (a sequence is at most three 30s calls). */
export const aiNewsStaleLeaseSeconds=600;
/** #160: a job that failed before the gateway is retried at most once per this many seconds, not on every page load. */
export const aiNewsRetrySeconds=300;
/** #769: a job whose draft the checks rejected ('validation') gets one retry: at most this many attempts reach the gateway per nation per UTC day.
 * Attempts are counted from this job's non-pending reservations, so each retry reserves budget normally and nothing is reserved twice. */
export const aiNewsMaxGatewayAttempts=2;
export async function prepareAiNews(db:GameDatabase,news:NationalNews,now:number,binding:NewsAiBinding|undefined,{enabled=false,budget=null as AiBudgetConfig|null,killSwitch=null as AiTemplatesOnlyEnv|null}={}){
 if(!enabled||!Number.isSafeInteger(now))return;
 // #742: templates-only mode skips the model call and the reservation; the edition keeps its deterministic items.
 if(skipForTemplates('ai-news',killSwitch,news.nationId,now))return;
 // #764: a muted news desk makes no model call and no reservation; the edition keeps its deterministic items.
 if(skipForMutedPersona('ai-news',killSwitch,aiPathPersonas['ai-news'](news.nationId),now))return;
 // #140: flag on but no binding/budget used to return silently; say why so preview checks can see it.
 if(!binding||!budget){console.warn(`[ai-news] enabled but skipped: ${!binding?'no AI binding':'invalid HARIMU_AI_DAILY_BUDGET_MICRO/HARIMU_AI_GATEWAY_ID'}`);return;}
 const facts=publicNewsFacts(news),id=`${facts.nationId}:${new Date(now*1000).toISOString().slice(0,10)}`;
 const lease=await db.prepare("INSERT OR IGNORE INTO ai_news_jobs(id,nation_id,utc_day,started_at,status) VALUES (?,?,?,?,'running')").bind(id,facts.nationId,id.slice(id.indexOf(':')+1),now).run();
 // #140: the daily lease used to be final, so a job that failed before any gateway call (budget unavailable, not
 // sent) or a run that died mid-flight blocked news for the rest of the UTC day with zero gateway calls.
 // Re-take it atomically in exactly those cases. A job that reached the gateway is retried only after a 'validation'
 // rejection (#769), once, after aiNewsRetrySeconds; transport/terms failures are never retried.
 // #160: (1) pre-gateway failures retry at most every aiNewsRetrySeconds, so a blocked budget doesn't rewrite the
 // job on every page load. (2) Reservations are named ai-news:<job>:<attempt>, and a stale running lease is NOT
 // retaken if any attempt for this job already reached the gateway (non-pending row): a crash after the call
 // must not charge the budget a second time. A crashed attempt's unsent (pending) row is released on retake.
 const attempts=`ai-news:${id}:%`;
 if(lease.meta.changes!==1){const retake=await db.prepare("UPDATE ai_news_jobs SET status='running',failure_code=NULL,started_at=? WHERE id=? AND ((status='failed' AND failure_code IN ('budget-unavailable','not-sent') AND started_at<=?) OR (status='failed' AND failure_code='validation' AND started_at<=? AND (SELECT COUNT(*) FROM harimu_ai_reservations WHERE request_id LIKE ? AND status<>'pending')<?) OR (status='running' AND started_at<=? AND NOT EXISTS(SELECT 1 FROM harimu_ai_reservations WHERE request_id LIKE ? AND status<>'pending')))").bind(now,id,now-aiNewsRetrySeconds,now-aiNewsRetrySeconds,attempts,aiNewsMaxGatewayAttempts,now-aiNewsStaleLeaseSeconds,attempts).run();if(retake.meta.changes!==1)return;
  await db.prepare("DELETE FROM harimu_ai_reservations WHERE request_id LIKE ? AND status='pending'").bind(attempts).run();}
 const reservation=`ai-news:${id}:${now}`;
 if(!await reserveAiSequence(db,reservation,now,budget)){await db.prepare("UPDATE ai_news_jobs SET status='failed',failure_code='budget-unavailable' WHERE id=?").bind(id).run();return;}
 let reached=false;const answered:AiMeteredCall[]=[]; // #92: true once any request is handed to the gateway
 const call=async(model:AiModel,messages:{role:'system'|'user'|'assistant';content:string}[],json:'draft'|'verification'|false=false)=>{
  if(new TextEncoder().encode(JSON.stringify(messages)).length>12000)throw Error('Inference input exceeded the public-facts bound.');
  let timeout:ReturnType<typeof setTimeout>|undefined;let result:unknown;if(!reached){reached=true;await markAiReservationSent(db,reservation);}
  try{result=await Promise.race([binding.run(model,{messages,max_tokens:256,temperature:0,stream:false,...(json?{response_format:json==='verification'?newsVerificationResponseFormat:newsDraftResponseFormat}:{})},aiGatewayOptions(budget)),new Promise<never>((_resolve,reject)=>{timeout=setTimeout(()=>reject(Error('Inference timed out.')),30000);})]);}catch(error){throw new AiNewsFailure(error&&typeof error==='object'&&(('code' in error&&String(error.code)==='5016')||('message' in error&&typeof error.message==='string'&&/\b5016\b/.test(error.message)))?`model-terms-5016:${model}`:'inference-uncertain');}finally{if(timeout!==undefined)clearTimeout(timeout);}
  answered.push({model,usage:result&&typeof result==='object'?(result as {usage?:unknown}).usage:undefined}); // #141/#170: the gateway answered; metered from its usage when valid
  // The provider has returned: malformed content is a known rejected attempt,
  // not an unresolved transport. It settles to the metered cost of the answered calls (#141).
  return inferenceText(result,Boolean(json));
 };
 try{
  // #769: do not send ledger values to the draft model. Preview's Kindle job (citizens 2, shifts 11, food 24)
  // copied those digits, and the retry wrote "a total of citizens". Both fail the checks below, so the day published nothing.
  // Verification still receives `facts`. newsDraftText renders the counts.
  const raw=await call('@cf/meta/llama-3.2-3b-instruct',[{role:'system',content:'Write a short neutral national news introduction. The user message names the ledger measures and does not include their values. The summary must be one complete explanatory sentence ending with punctuation, not a heading or label. Return JSON with title, summary, and claims (an array containing only citizens, completedShifts, food). Include no digits, number words, or quantity phrases such as a total of, a number of, all, many, more or less in title or summary. An acceptable summary is: The public ledger records registered citizens, completed paid shifts and food. Claims are rendered by the server. Explain only what these ledger counters measure. Zero is a recorded count, not missing data or evidence about underway work. Do not infer incomplete records or invent policy, prices, events or outcomes.'},{role:'user',content:JSON.stringify({nationId:facts.nationId,available:['citizens','completedShifts','food'],note:'The server shows the values of these counts after your summary.'})}],'draft');
  const draft=validatedNewsIntroduction(JSON.parse(raw));if(!draft)throw Error('Unsupported news introduction.');
  const supported=await call('@cf/meta/llama-3.2-3b-instruct',[{role:'system',content:'Check only this draft prose against the provided public facts. The claims array contains allowlisted fact keys; the server renders their exact ledger values, including zero. They are not invented statements or supplied quantities. General advice to read public records is supported. Reject invented policy, prices, outcomes, identities or quantities in prose. Return JSON with a supported boolean; true only when the prose is supported.'},{role:'user',content:JSON.stringify({facts,draft})}],'verification');if(!supportedNewsDraft(supported))throw Error('Unsupported draft.');
  const safe=await call('@cf/meta/llama-guard-3-8b',[{role:'user',content:'Provide a neutral national record from these public facts: '+JSON.stringify(facts)},{role:'assistant',content:JSON.stringify(draft)}]);if(safe.trim()!=='safe')throw Error('Unsafe draft.');
  await db.batch([db.prepare('INSERT OR IGNORE INTO ai_news_articles(id,nation_id,title,body,created_at,model,facts_json) VALUES (?,?,?,?,?,?,?)').bind(id,facts.nationId,draft.title,newsDraftText(draft,facts),now,'@cf/meta/llama-3.2-3b-instruct',JSON.stringify(facts)),db.prepare("UPDATE ai_news_jobs SET status='published' WHERE id=?").bind(id),db.prepare("UPDATE harimu_ai_reservations SET status='finished' WHERE request_id=?").bind(reservation)]);
 }catch(error){if(!reached){await releaseAiReservation(db,reservation);await db.prepare("UPDATE ai_news_jobs SET status='failed',failure_code='not-sent' WHERE id=?").bind(id).run();return;}const code=error instanceof AiNewsFailure?error.code:'validation';console.warn('[ai-news] failed',id,code); // #769: code only, never prompt/reply text
  await db.prepare("UPDATE ai_news_jobs SET status='failed',failure_code=? WHERE id=?").bind(code,id).run();
  // #141: an unresolved transport keeps the full reservation; a known rejection settles to the metered cost.
  if(error instanceof AiNewsFailure)await markAiReservationUncertain(db,reservation);else await settleAiReservation(db,reservation,meteredAiCost(answered));}
}
export async function readAiNews(db:GameDatabase,nationId:string):Promise<NewsItem[]>{
 const result=await db.prepare('SELECT id,title,body,created_at FROM ai_news_articles WHERE nation_id=? ORDER BY created_at DESC LIMIT 6').bind(nationId).all<{id:string;title:string;body:string;created_at:number}>();
 return result.results.map(r=>({id:`model:${r.id}`,title:r.title,text:r.body,occurredAt:r.created_at*1000,source:'model'}));
}
/** #742: merge model articles into the edition, unless templates-only mode covers it: then no model article is shown and the edition is
 * marked templatesOnly so the feed shows the template-mode footer from lib/kill-switch-copy.ts. */
export function withAiNews(news:NationalNews,aiItems:NewsItem[],templatesOnly:boolean):NationalNews{
 if(templatesOnly)return {...news,templatesOnly:true,items:news.items.filter(item=>item.source!=='model')};
 return {...news,items:[...aiItems,...news.items].sort((a,b)=>b.occurredAt-a.occurredAt).slice(0,12)};
}
