import type {GameDatabase} from './database-contract';
import type {NationalNews,NewsItem} from './national-news';
import {reserveAiSequence,aiBudgetSchema,type AiModel} from './ai-budget';
export const aiNewsEnabled=true; // Preview activation approved 2026-10-14; runtime flags and pricing expiry still gate inference.
export const aiNewsSchemas=[aiBudgetSchema,
 `CREATE TABLE IF NOT EXISTS ai_news_jobs(id TEXT PRIMARY KEY,nation_id TEXT NOT NULL CHECK(nation_id IN ('kindle','korund','aurelle')),utc_day TEXT NOT NULL,started_at INTEGER NOT NULL,status TEXT NOT NULL CHECK(status IN ('running','published','failed')),failure_code TEXT)`,
 `CREATE TABLE IF NOT EXISTS ai_news_articles(id TEXT PRIMARY KEY,nation_id TEXT NOT NULL CHECK(nation_id IN ('kindle','korund','aurelle')),title TEXT NOT NULL,body TEXT NOT NULL,created_at INTEGER NOT NULL,model TEXT NOT NULL,facts_json TEXT NOT NULL)`,
] as const;
export type NewsAiBinding={run:(model:string,input:{messages:{role:'system'|'user'|'assistant';content:string}[];max_tokens:number;temperature:number;stream:false;response_format?:typeof newsDraftResponseFormat|typeof newsVerificationResponseFormat})=>Promise<unknown>};
class AiNewsFailure extends Error{constructor(readonly code:string){super('AI news unavailable.');}}
type Facts={nationId:string;citizens:number;completedShifts:number;food:number};
type Draft={title:string;summary:string;claims:('citizens'|'completedShifts'|'food')[]};
export function publicNewsFacts(news:NationalNews):Facts{
 if(!['kindle','korund','aurelle'].includes(news.nationId))throw Error('Unsupported edition.');
 const {citizens,completedShifts,food}=news.statistics;if([citizens,completedShifts,food].some(n=>!Number.isSafeInteger(n)||n<0))throw Error('Invalid public facts.');
 return {nationId:news.nationId,citizens,completedShifts,food};
}
const quantitative=/\p{Number}|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|dozen|half|double|triple|twice|percent|majority|minority|everyone|all|many|most|more|less|fewer|higher|lower)\b/iu;
export function validatedNewsDraft(value:unknown):Draft|null{
 if(!value||typeof value!=='object')return null;const d=value as Record<string,unknown>;
 if(typeof d.title!=='string'||typeof d.summary!=='string'||!d.title.trim()||!d.summary.trim()||d.title.length>100||d.summary.length>500||quantitative.test(d.title+' '+d.summary)||/[<>\[\]{}]/.test(d.title+d.summary)||!Array.isArray(d.claims)||d.claims.length<1||d.claims.length>3||new Set(d.claims).size!==d.claims.length||d.claims.some(v=>typeof v!=='string'||!['citizens','completedShifts','food'].includes(v)))return null;
 return {title:d.title.trim(),summary:d.summary.trim(),claims:d.claims as Draft['claims']};
}
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
export async function prepareAiNews(db:GameDatabase,news:NationalNews,now:number,binding:NewsAiBinding|undefined,{enabled=false,priceReviewedUntil=0}={}){
 if(!enabled||!binding||!Number.isSafeInteger(now)||priceReviewedUntil<=now)return;
 const facts=publicNewsFacts(news),id=`${facts.nationId}:${new Date(now*1000).toISOString().slice(0,10)}`;
 const lease=await db.prepare("INSERT OR IGNORE INTO ai_news_jobs(id,nation_id,utc_day,started_at,status) VALUES (?,?,?,?,'running')").bind(id,facts.nationId,id.slice(id.indexOf(':')+1),now).run();if(lease.meta.changes!==1)return;
 const reservation=crypto.randomUUID();
 if(!await reserveAiSequence(db,reservation,now,priceReviewedUntil)){await db.prepare("UPDATE ai_news_jobs SET status='failed',failure_code='budget-unavailable' WHERE id=?").bind(id).run();return;}
 const call=async(model:AiModel,messages:{role:'system'|'user'|'assistant';content:string}[],json:'draft'|'verification'|false=false)=>{
  if(new TextEncoder().encode(JSON.stringify(messages)).length>12000)throw Error('Inference input exceeded the public-facts bound.');
  let timeout:ReturnType<typeof setTimeout>|undefined;
  try{const result=await Promise.race([binding.run(model,{messages,max_tokens:256,temperature:0,stream:false,...(json?{response_format:json==='verification'?newsVerificationResponseFormat:newsDraftResponseFormat}:{})}),new Promise<never>((_resolve,reject)=>{timeout=setTimeout(()=>reject(Error('Inference timed out.')),30000);})]);return inferenceText(result,Boolean(json));}catch(error){throw new AiNewsFailure(error&&typeof error==='object'&&(('code' in error&&String(error.code)==='5016')||('message' in error&&typeof error.message==='string'&&/\b5016\b/.test(error.message)))?`model-terms-5016:${model}`:'inference-uncertain');}finally{if(timeout!==undefined)clearTimeout(timeout);}
 };
 try{
  const raw=await call('@cf/meta/llama-3.2-3b-instruct',[{role:'system',content:'Write a short neutral national news introduction based only on the provided public ledger facts. Return JSON with title, summary, and claims (an array containing only citizens, completedShifts, food). Include no numbers or quantifier words such as one, all, many, more or less in title/summary, even in nonnumeric meanings. Claims are rendered by the server. Do not invent policy, prices, events or outcomes.'},{role:'user',content:JSON.stringify(facts)}],'draft');
  const draft=validatedNewsDraft(JSON.parse(raw));if(!draft)throw Error('Unsupported draft.');
  const supported=await call('@cf/meta/llama-3.2-3b-instruct',[{role:'system',content:'Check only this draft prose against the provided public facts. The claims array contains allowlisted fact keys; the server renders their exact ledger values, including zero. They are not invented statements or supplied quantities. General advice to read public records is supported. Reject invented policy, prices, outcomes, identities or quantities in prose. Return JSON with a supported boolean; true only when the prose is supported.'},{role:'user',content:JSON.stringify({facts,draft})}],'verification');if(!supportedNewsDraft(supported))throw Error('Unsupported draft.');
  const safe=await call('@cf/meta/llama-guard-3-8b',[{role:'user',content:'Provide a neutral national record from these public facts: '+JSON.stringify(facts)},{role:'assistant',content:JSON.stringify(draft)}]);if(safe.trim()!=='safe')throw Error('Unsafe draft.');
  await db.batch([db.prepare('INSERT OR IGNORE INTO ai_news_articles(id,nation_id,title,body,created_at,model,facts_json) VALUES (?,?,?,?,?,?,?)').bind(id,facts.nationId,draft.title,newsDraftText(draft,facts),now,'@cf/meta/llama-3.2-3b-instruct',JSON.stringify(facts)),db.prepare("UPDATE ai_news_jobs SET status='published' WHERE id=?").bind(id),db.prepare("UPDATE harimu_ai_reservations SET status='finished' WHERE request_id=?").bind(reservation)]);
 }catch(error){const code=error instanceof AiNewsFailure?error.code:'validation';await db.batch([db.prepare("UPDATE ai_news_jobs SET status='failed',failure_code=? WHERE id=?").bind(code,id),db.prepare('UPDATE harimu_ai_reservations SET status=? WHERE request_id=?').bind(error instanceof AiNewsFailure?'uncertain':'finished',reservation)]);}
}
export async function readAiNews(db:GameDatabase,nationId:string):Promise<NewsItem[]>{
 const result=await db.prepare('SELECT id,title,body,created_at FROM ai_news_articles WHERE nation_id=? ORDER BY created_at DESC LIMIT 6').bind(nationId).all<{id:string;title:string;body:string;created_at:number}>();
 return result.results.map(r=>({id:`model:${r.id}`,title:r.title,text:r.body,occurredAt:r.created_at*1000,source:'model'}));
}
