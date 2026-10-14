import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {localRuntime} from './helpers/local-runtime.mjs';
import {reserveAiCall,reserveAiSequence,aiModelReservations,aiDailyBudgetMicroUsd} from '../lib/ai-budget.ts';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=(await readFile(new URL('../lib/ai-news.ts',import.meta.url),'utf8')).replace("'./ai-budget'",JSON.stringify(new URL('../lib/ai-budget.ts',import.meta.url).href)).replace('30000','5');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {prepareAiNews,publicNewsFacts,validatedNewsDraft,newsDraftText,aiNewsEnabled,inferenceText,supportedNewsDraft}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const model='@cf/meta/llama-3.2-3b-instruct';
const now=Math.floor(Date.now()/1000),until=now+3600;
const news={nationId:'kindle',title:'Kindle Press',style:'press',fetchedAt:now*1000,statistics:{citizens:2,completedShifts:3,food:12},items:[],privateDraft:'never transmit',accountId:'private'};
const draft={title:'National ledger record',summary:'Recorded work contributes to household food.',claims:['citizens','completedShifts','food']};
test('only public numeric facts enter inference; numerical claims are rendered from authoritative values',()=>{
 assert.equal(aiNewsEnabled,true);assert.deepEqual(publicNewsFacts(news),{nationId:'kindle',citizens:2,completedShifts:3,food:12});
 assert.match(newsDraftText(validatedNewsDraft(draft),publicNewsFacts(news)),/12 food earned/);
 for(const invalid of [{...draft,title:'Output rose 99%'},{...draft,summary:'A hundred citizens joined.'},{...draft,claims:['budget']},{...draft,claims:['food','food']}])assert.equal(validatedNewsDraft(invalid),null);
 assert.throws(()=>publicNewsFacts({...news,statistics:{...news.statistics,food:NaN}}));
 // Conservative full-context bounds, not rounded prices or free quota assumptions.
 assert.ok(aiModelReservations[model]>=Math.ceil((80000*.051+256*.336)));
 assert.ok(aiModelReservations['@cf/meta/llama-guard-3-8b']>=Math.ceil(131072*.485+256*.031));
});
test('concurrent inference reservations cannot exceed global daily budget; duplicate IDs and unknown prices fail closed',async t=>{
 const r=await localRuntime();t.after(()=>r.close());const ids=Array.from({length:240},()=>randomUUID());const reserved=await Promise.all(ids.map(id=>reserveAiCall(r.db,id,model,now,until)));
 const total=await r.db.prepare('SELECT SUM(reserved_micro) AS cost,COUNT(*) AS n FROM harimu_ai_reservations').first();assert.ok(total.cost<=aiDailyBudgetMicroUsd);assert.equal(total.n,200);assert.equal(reserved.filter(Boolean).length,200);
 assert.equal(await reserveAiCall(r.db,ids[0],model,now,until),false);assert.equal(await reserveAiCall(r.db,randomUUID(),model,now,now-1),false);
 assert.equal(await reserveAiCall(r.db,randomUUID(),model,now,now+90000),false);
 assert.equal(await reserveAiCall(r.db,randomUUID(),'unpriced-model',now,until),false);
});
test('disabled news makes no calls; publication is daily idempotent, moderated, and bound to public facts',async t=>{
 const r=await localRuntime();t.after(()=>r.close());let calls=0;const binding={async run(_model,input){assert.equal(input.max_tokens,256);assert.equal(input.stream,false);assert.doesNotMatch(JSON.stringify(input),/never transmit|accountId|privateDraft/);return {response:[JSON.stringify(draft),'supported','safe'][calls++]};}};
 await prepareAiNews(r.db,news,now,binding);assert.equal(calls,0);assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM harimu_ai_reservations').first()).n,0);
 await Promise.all([prepareAiNews(r.db,news,now,binding,{enabled:true,priceReviewedUntil:until}),prepareAiNews(r.db,news,now,binding,{enabled:true,priceReviewedUntil:until})]);assert.equal(calls,3);
 const article=await r.db.prepare('SELECT body,facts_json FROM ai_news_articles').first();assert.match(article.body,/2 registered citizens/);assert.doesNotMatch(article.facts_json,/private/);
 assert.equal((await r.db.prepare('SELECT SUM(reserved_micro) AS n FROM harimu_ai_reservations').first()).n,72400);
});
test('unsafe output and uncertain calls never publish; reservations remain charged and block uncertain rollover',async t=>{
 const r=await localRuntime();t.after(()=>r.close());let calls=0;const unsafe={async run(){return {response:[JSON.stringify(draft),'supported','unsafe'][calls++]};}};
 await prepareAiNews(r.db,news,now,unsafe,{enabled:true,priceReviewedUntil:until});assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM ai_news_articles').first()).n,0);
 const other={...news,nationId:'korund'};const fail={async run(){throw Error('Provider detail must not leak.');}};await prepareAiNews(r.db,other,now,fail,{enabled:true,priceReviewedUntil:until});
 assert.equal((await r.db.prepare("SELECT COUNT(*) AS n FROM harimu_ai_reservations WHERE status='uncertain'").first()).n,1);
 assert.equal(await reserveAiCall(r.db,randomUUID(),model,now+86400,now+90000),false);
 assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM ai_news_articles').first()).n,0);
});

test('moderation reservations hit the cost ceiling, and prebooking protects completed requests across midnight',async t=>{
 const r=await localRuntime();t.after(()=>r.close());const guard='@cf/meta/llama-guard-3-8b';const results=await Promise.all(Array.from({length:20},()=>reserveAiCall(r.db,randomUUID(),guard,now,until)));assert.equal(results.filter(Boolean).length,15);
 const cost=(await r.db.prepare('SELECT SUM(reserved_micro) AS n FROM harimu_ai_reservations').first()).n;assert.equal(cost,960000);
 await r.db.prepare("UPDATE harimu_ai_reservations SET status='finished'").run();assert.equal(await reserveAiCall(r.db,randomUUID(),guard,now+86400,now+90000),false);
});
test('a timed-out provider remains charged and a late response cannot publish',async t=>{
 const r=await localRuntime();t.after(()=>r.close());let finish;const binding={run:()=>new Promise(resolve=>{finish=resolve;})};
 await prepareAiNews(r.db,news,now,binding,{enabled:true,priceReviewedUntil:until});finish({response:JSON.stringify(draft)});await new Promise(resolve=>setImmediate(resolve));
 assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM ai_news_articles').first()).n,0);assert.equal((await r.db.prepare("SELECT reserved_micro AS n FROM harimu_ai_reservations WHERE status='uncertain'").first()).n,72400);
});

test('unaccepted model terms are reported as a sanitized operator code without accepting anything',async t=>{
 const r=await localRuntime();t.after(()=>r.close());const binding={async run(){throw Object.assign(Error('5016 Terms not accepted; sensitive provider details'),{code:5016});}};
 await prepareAiNews(r.db,news,now,binding,{enabled:true,priceReviewedUntil:until});assert.equal((await r.db.prepare('SELECT failure_code FROM ai_news_jobs').first()).failure_code,'model-terms-5016:@cf/meta/llama-3.2-3b-instruct');
});

test('whole news sequence is reserved before generation, so insufficient moderation capacity makes zero model calls',async t=>{
 const r=await localRuntime();t.after(()=>r.close());for(let i=0;i<14;i++)assert.equal(await reserveAiCall(r.db,randomUUID(),'@cf/meta/llama-guard-3-8b',now,until),true);
 assert.equal(await reserveAiCall(r.db,randomUUID(),model,now,until),true);assert.equal(await reserveAiCall(r.db,randomUUID(),model,now,until),true);
 let calls=0;await prepareAiNews(r.db,news,now,{async run(){calls++;return {response:JSON.stringify(draft)}}},{enabled:true,priceReviewedUntil:until});assert.equal(calls,0);
 assert.equal(await reserveAiSequence(r.db,randomUUID(),now,until),false);
});

test('truncated moderation never approves an otherwise safe-looking classification',async t=>{
 const r=await localRuntime();t.after(()=>r.close());let call=0;const binding={async run(){const response=[JSON.stringify(draft),'supported','safe'][call++];return call===3?{response,finish_reason:'length',usage:{completion_tokens:256}}:{response};}};
 await prepareAiNews(r.db,news,now,binding,{enabled:true,priceReviewedUntil:until});assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM ai_news_articles').first()).n,0);
});

test('documented structured responses are accepted only for schema-mode drafts; truncation stays rejected',()=>{
 assert.equal(inferenceText({response:draft,choices:[{finish_reason:'stop'}]},true),JSON.stringify(draft));
 assert.throws(()=>inferenceText({response:draft}));assert.throws(()=>inferenceText({response:draft,choices:[{finish_reason:'length'}]},true));assert.throws(()=>inferenceText({response:'safe',usage:{completion_tokens:256}}));assert.throws(()=>inferenceText({response:42},true));
});

test('structured fact checking accepts only explicit support and refuses false or malformed decisions',()=>{
 assert.equal(supportedNewsDraft('{"supported":true}'),true);for(const raw of ['{"supported":false}','{"supported":"true"}','{"supported":true,"override":true}','safe','[true]','null'])assert.equal(Boolean(supportedNewsDraft(raw)),false);
});
