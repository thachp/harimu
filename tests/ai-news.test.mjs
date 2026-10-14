import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {localRuntime} from './helpers/local-runtime.mjs';
import {reserveAiCall,reserveAiSequence,aiModelReservations,aiDailyBudgetMicroUsd} from '../lib/ai-budget.ts';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=(await readFile(new URL('../lib/ai-news.ts',import.meta.url),'utf8')).replace("'./ai-budget'",JSON.stringify(new URL('../lib/ai-budget.ts',import.meta.url).href)).replace('30000','5');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {prepareAiNews,publicNewsFacts,validatedNewsDraft,newsDraftText,aiNewsEnabled,inferenceText,supportedNewsDraft,validatedNewsIntroduction}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const model='@cf/meta/llama-3.2-3b-instruct';
const now=Math.floor(Date.now()/1000),until={dailyBudgetMicro:970000,gatewayId:'harimu-test'};
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
 assert.equal(await reserveAiCall(r.db,ids[0],model,now,until),false);assert.equal(await reserveAiCall(r.db,randomUUID(),model,now,null),false);assert.equal(await reserveAiCall(r.db,randomUUID(),model,now,now+3600),false);
 assert.equal(await reserveAiCall(r.db,randomUUID(),model,now,{dailyBudgetMicro:970001,gatewayId:'g'}),false);assert.equal(await reserveAiCall(r.db,randomUUID(),model,now,{dailyBudgetMicro:4200,gatewayId:''}),false);
 assert.equal(await reserveAiCall(r.db,randomUUID(),'unpriced-model',now,until),false);
});
test('disabled news makes no calls; publication is daily idempotent, moderated, and bound to public facts',async t=>{
 const r=await localRuntime();t.after(()=>r.close());let calls=0;const binding={async run(_model,input){assert.equal(input.max_tokens,256);assert.equal(input.stream,false);assert.doesNotMatch(JSON.stringify(input),/never transmit|accountId|privateDraft/);return {response:[JSON.stringify(draft),'supported','safe'][calls++]};}};
 await prepareAiNews(r.db,news,now,binding);assert.equal(calls,0);assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM harimu_ai_reservations').first()).n,0);
 await Promise.all([prepareAiNews(r.db,news,now,binding,{enabled:true,budget:until}),prepareAiNews(r.db,news,now,binding,{enabled:true,budget:until})]);assert.equal(calls,3);
 const article=await r.db.prepare('SELECT body,facts_json FROM ai_news_articles').first();assert.match(article.body,/2 registered citizens/);assert.doesNotMatch(article.facts_json,/private/);
 assert.equal((await r.db.prepare('SELECT SUM(reserved_micro) AS n FROM harimu_ai_reservations').first()).n,72400);
});
test('unsafe output and uncertain calls never publish; reservations remain charged; uncertain rollover blocks only within the TTL',async t=>{
 const r=await localRuntime();t.after(()=>r.close());let calls=0;const unsafe={async run(){return {response:[JSON.stringify(draft),'supported','unsafe'][calls++]};}};
 await prepareAiNews(r.db,news,now,unsafe,{enabled:true,budget:until});assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM ai_news_articles').first()).n,0);
 const other={...news,nationId:'korund'};const fail={async run(){throw Error('Provider detail must not leak.');}};await prepareAiNews(r.db,other,now,fail,{enabled:true,budget:until});
 assert.equal((await r.db.prepare("SELECT COUNT(*) AS n FROM harimu_ai_reservations WHERE status='uncertain'").first()).n,1);
 assert.equal(await reserveAiCall(r.db,randomUUID(),model,now+86400,until),true);assert.equal((await r.db.prepare("SELECT COUNT(*) AS n FROM harimu_ai_reservations WHERE status='uncertain'").first()).n,1);
 assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM ai_news_articles').first()).n,0);
});

test('moderation reservations hit the cost ceiling, and prebooking protects completed requests across midnight',async t=>{
 const r=await localRuntime();t.after(()=>r.close());const guard='@cf/meta/llama-guard-3-8b';const results=await Promise.all(Array.from({length:20},()=>reserveAiCall(r.db,randomUUID(),guard,now,until)));assert.equal(results.filter(Boolean).length,15);
 const cost=(await r.db.prepare('SELECT SUM(reserved_micro) AS n FROM harimu_ai_reservations').first()).n;assert.equal(cost,960000);
 await r.db.prepare("UPDATE harimu_ai_reservations SET status='finished'").run();assert.equal(await reserveAiCall(r.db,randomUUID(),guard,now+86400,until),false);
});
test('a timed-out provider remains charged and a late response cannot publish',async t=>{
 const r=await localRuntime();t.after(()=>r.close());let finish;const binding={run:()=>new Promise(resolve=>{finish=resolve;})};
 await prepareAiNews(r.db,news,now,binding,{enabled:true,budget:until});finish({response:JSON.stringify(draft)});await new Promise(resolve=>setImmediate(resolve));
 assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM ai_news_articles').first()).n,0);assert.equal((await r.db.prepare("SELECT reserved_micro AS n FROM harimu_ai_reservations WHERE status='uncertain'").first()).n,72400);
});

test('unaccepted model terms are reported as a sanitized operator code without accepting anything',async t=>{
 const r=await localRuntime();t.after(()=>r.close());const binding={async run(){throw Object.assign(Error('5016 Terms not accepted; sensitive provider details'),{code:5016});}};
 await prepareAiNews(r.db,news,now,binding,{enabled:true,budget:until});assert.equal((await r.db.prepare('SELECT failure_code FROM ai_news_jobs').first()).failure_code,'model-terms-5016:@cf/meta/llama-3.2-3b-instruct');
});

test('whole news sequence is reserved before generation, so insufficient moderation capacity makes zero model calls',async t=>{
 const r=await localRuntime();t.after(()=>r.close());for(let i=0;i<14;i++)assert.equal(await reserveAiCall(r.db,randomUUID(),'@cf/meta/llama-guard-3-8b',now,until),true);
 assert.equal(await reserveAiCall(r.db,randomUUID(),model,now,until),true);assert.equal(await reserveAiCall(r.db,randomUUID(),model,now,until),true);
 let calls=0;await prepareAiNews(r.db,news,now,{async run(){calls++;return {response:JSON.stringify(draft)}}},{enabled:true,budget:until});assert.equal(calls,0);
 assert.equal(await reserveAiSequence(r.db,randomUUID(),now,until),false);
});

test('truncated moderation never approves an otherwise safe-looking classification',async t=>{
 const r=await localRuntime();t.after(()=>r.close());let call=0;const binding={async run(){const response=[JSON.stringify(draft),'supported','safe'][call++];return call===3?{response,finish_reason:'length',usage:{completion_tokens:256}}:{response};}};
 await prepareAiNews(r.db,news,now,binding,{enabled:true,budget:until});assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM ai_news_articles').first()).n,0);
});

test('documented structured responses are accepted only for schema-mode drafts; truncation stays rejected',()=>{
 assert.equal(inferenceText({response:draft,choices:[{finish_reason:'stop'}]},true),JSON.stringify(draft));
 assert.throws(()=>inferenceText({response:draft}));assert.throws(()=>inferenceText({response:draft,choices:[{finish_reason:'length'}]},true));assert.throws(()=>inferenceText({response:'safe',usage:{completion_tokens:256}}));assert.throws(()=>inferenceText({response:42},true));
});

test('structured fact checking accepts only explicit support and refuses false or malformed decisions',()=>{
 assert.equal(supportedNewsDraft('{"supported":true}'),true);for(const raw of ['{"supported":false}','{"supported":"true"}','{"supported":true,"override":true}','safe','[true]','null'])assert.equal(Boolean(supportedNewsDraft(raw)),false);
});

test('captured heading-only news is not an explanatory introduction; supported sentences still require verification',()=>{
 const captured={title:'National Status Report',summary:'National Ledger Facts',claims:['citizens','completedShifts','food']};assert.ok(validatedNewsDraft(captured));assert.equal(validatedNewsIntroduction(captured),null);assert.ok(validatedNewsIntroduction({...captured,summary:'The ledger records registered citizens and completed paid work.'}));
});

test('fulfilled malformed response is terminal failure, retains the full charge and does not create permanent uncertainty',async t=>{
 const r=await localRuntime();t.after(()=>r.close());await prepareAiNews(r.db,news,now,{async run(){return {response:42};}},{enabled:true,budget:until});const row=await r.db.prepare('SELECT reserved_micro,status FROM harimu_ai_reservations').first();assert.equal(row.reserved_micro,72400);assert.equal(row.status,'finished');assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM ai_news_articles').first()).n,0);assert.equal(await reserveAiCall(r.db,randomUUID(),model,now+86400,until),true);
});
test('#45: env budget config fails closed, can only lower the hard ceiling, and routes inference through AI Gateway',async t=>{
 const {aiBudgetConfig,readAiBudget}=await import('../lib/ai-budget.ts');const {aiPricesStale,aiPricesVerifiedAt,isPricedAiModel}=await import('../lib/ai-budget.ts');
 assert.deepEqual(aiBudgetConfig({HARIMU_AI_DAILY_BUDGET_MICRO:'500000',HARIMU_AI_GATEWAY_ID:'harimu-preview'},now),{dailyBudgetMicro:500000,gatewayId:'harimu-preview'});
 for(const env of [{},{HARIMU_AI_GATEWAY_ID:'g'},{HARIMU_AI_DAILY_BUDGET_MICRO:'500000'},{HARIMU_AI_DAILY_BUDGET_MICRO:'970001',HARIMU_AI_GATEWAY_ID:'g'},{HARIMU_AI_DAILY_BUDGET_MICRO:'0',HARIMU_AI_GATEWAY_ID:'g'},{HARIMU_AI_DAILY_BUDGET_MICRO:'1e5',HARIMU_AI_GATEWAY_ID:'g'},{HARIMU_AI_DAILY_BUDGET_MICRO:'500000',HARIMU_AI_GATEWAY_ID:'bad id/'},{HARIMU_AI_PRICE_REVIEWED_UNTIL:new Date(Date.now()+3600000).toISOString()}])assert.equal(aiBudgetConfig(env,now),null);
 // No daily renewal: a config stays valid far beyond 24h; a stale price table only warns.
 const later=Math.floor(Date.parse(aiPricesVerifiedAt)/1000)+86400*90;assert.equal(aiPricesStale(later),true);
 const warn=t.mock.method(console,'warn',()=>{});assert.notEqual(aiBudgetConfig({HARIMU_AI_DAILY_BUDGET_MICRO:'500000',HARIMU_AI_GATEWAY_ID:'g'},later),null);assert.ok(warn.mock.callCount()<=1);
 assert.equal(isPricedAiModel(model),true);assert.equal(isPricedAiModel('@cf/unknown/model'),false);
 const r=await localRuntime();t.after(()=>r.close());const small={dailyBudgetMicro:72400,gatewayId:'harimu-test'};
 assert.equal(await reserveAiSequence(r.db,randomUUID(),later,small),true);assert.equal(await reserveAiSequence(r.db,randomUUID(),later,small),false);
 const read=await readAiBudget(r.db,later,small);assert.equal(read.remainingMicroUsd,0);assert.equal(read.pricesStale,true);assert.equal((await readAiBudget(r.db,later,null)).dailyBudgetMicroUsd,0);
 const r2=await localRuntime();t.after(()=>r2.close());const options=[];
 await prepareAiNews(r2.db,news,now,{async run(_m,_i,o){options.push(o);return {response:'safe'};}},{enabled:true,budget:until});
 assert.ok(options.length>0);for(const o of options)assert.deepEqual(o,{gateway:{id:'harimu-test'}});
 let calls=0;const r3=await localRuntime();t.after(()=>r3.close());await prepareAiNews(r3.db,news,now,{async run(){calls++;}},{enabled:true,budget:null});assert.equal(calls,0);
});
const cfg=micro=>({dailyBudgetMicro:micro,gatewayId:'harimu-test'});
test('#45 QA: concurrent reservations at the cap never exceed it, and an exact-fit reservation succeeds',async t=>{
 const {readAiBudget}=await import('../lib/ai-budget.ts');const r=await localRuntime();t.after(()=>r.close());
 const exact=cfg(4200*5);const results=await Promise.all(Array.from({length:25},()=>reserveAiCall(r.db,randomUUID(),model,now,exact)));
 assert.equal(results.filter(Boolean).length,5);const b=await readAiBudget(r.db,now,exact);assert.equal(b.reservedMicroUsd,21000);assert.equal(b.remainingMicroUsd,0);
 assert.equal(await reserveAiCall(r.db,randomUUID(),model,now,exact),false);assert.equal(await reserveAiCall(r.db,randomUUID(),model,now,cfg(21000+4199)),false);assert.equal(await reserveAiCall(r.db,randomUUID(),model,now,cfg(21000+4200)),true);
});
test('#45 QA: the committed re-check withdraws a reservation that a racing writer pushed over the cap',async t=>{
 const {reserveAiCall:reserve}=await import('../lib/ai-budget.ts');const r=await localRuntime();t.after(()=>r.close());
 // Simulate a READ COMMITTED race: a rival row commits between this insert and its re-check.
 const day=new Date(now*1000).toISOString().slice(0,10),next=new Date((now+86400)*1000).toISOString().slice(0,10);let injected=false;
 const racing={prepare(sql){const st=r.db.prepare(sql);return {bind:(...v)=>{const b=st.bind(...v);return {...b,run:async()=>{const out=await b.run();if(!injected&&/^INSERT OR IGNORE/.test(sql)){injected=true;await r.db.prepare("INSERT INTO harimu_ai_reservations VALUES ('rival',?,?,?,4200,?,'pending')").bind(day,next,model,now).run();}return out;},first:()=>b.first(),all:()=>b.all()};}};},batch:s=>r.db.batch(s)};
 assert.equal(await reserve(racing,'mine',model,now,cfg(4200)),false);
 assert.deepEqual((await r.db.prepare('SELECT request_id FROM harimu_ai_reservations').all()).results.map(x=>x.request_id),['rival']);
});
test('#45 QA: an uncertain reservation from an outage blocks only until its TTL, and its charge is kept',async t=>{
 const {readAiBudget,aiUncertainBlockTtlSeconds}=await import('../lib/ai-budget.ts');const r=await localRuntime();t.after(()=>r.close());
 const late=Date.parse('2026-10-14T23:50:00Z')/1000,c=cfg(970000);assert.equal(aiUncertainBlockTtlSeconds,3600);
 assert.equal(await reserveAiCall(r.db,'outage',model,late,c),true);await r.db.prepare("UPDATE harimu_ai_reservations SET status='uncertain'").run();
 assert.equal((await readAiBudget(r.db,late+1200,c)).blocked,true);assert.equal(await reserveAiCall(r.db,randomUUID(),model,late+1200,c),false);
 assert.equal(await reserveAiCall(r.db,randomUUID(),model,late+3599,c),false);
 const after=late+3600;const b=await readAiBudget(r.db,after,c);assert.equal(b.blocked,false);assert.equal(b.reservedMicroUsd,4200);
 assert.equal(await reserveAiCall(r.db,randomUUID(),model,after,c),true);assert.equal((await r.db.prepare("SELECT status FROM harimu_ai_reservations WHERE request_id='outage'").first()).status,'uncertain');
});
test('#45 QA: invalid, missing or gateway-less settings make no reservation and no inference',async t=>{
 const {aiBudgetConfig}=await import('../lib/ai-budget.ts');const r=await localRuntime();t.after(()=>r.close());
 for(const env of [{},{HARIMU_AI_DAILY_BUDGET_MICRO:'970000'},{HARIMU_AI_DAILY_BUDGET_MICRO:'970000',HARIMU_AI_GATEWAY_ID:''},{HARIMU_AI_DAILY_BUDGET_MICRO:'',HARIMU_AI_GATEWAY_ID:'g'},{HARIMU_AI_DAILY_BUDGET_MICRO:'-1',HARIMU_AI_GATEWAY_ID:'g'},{HARIMU_AI_DAILY_BUDGET_MICRO:'12.5',HARIMU_AI_GATEWAY_ID:'g'},{HARIMU_AI_DAILY_BUDGET_MICRO:' 970000',HARIMU_AI_GATEWAY_ID:'g'},{HARIMU_AI_DAILY_BUDGET_MICRO:'abc',HARIMU_AI_GATEWAY_ID:'g'}])assert.equal(aiBudgetConfig(env,now),null);
 assert.equal(aiBudgetConfig({HARIMU_AI_DAILY_BUDGET_MICRO:'970000',HARIMU_AI_GATEWAY_ID:'g'},now)?.dailyBudgetMicro,970000);
 for(const bad of [null,undefined,{dailyBudgetMicro:970000},{dailyBudgetMicro:970000,gatewayId:''},{dailyBudgetMicro:0,gatewayId:'g'},{dailyBudgetMicro:1.5,gatewayId:'g'},now+3600])assert.equal(await reserveAiCall(r.db,randomUUID(),model,now,bad),false);
 let calls=0;await prepareAiNews(r.db,news,now,{async run(){calls++;}},{enabled:true,budget:aiBudgetConfig({HARIMU_AI_DAILY_BUDGET_MICRO:'970000'},now)});assert.equal(calls,0);
 assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM harimu_ai_reservations').first()).n,0);
});
