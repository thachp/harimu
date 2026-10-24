import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {localRuntime} from './helpers/local-runtime.mjs';
// #769: a validation rejection gets one retry per nation per UTC day; failures log the code only. No live AI is used.
const source=(await readFile(new URL('../lib/ai-news.ts',import.meta.url),'utf8')).replace("'./ai-budget'",JSON.stringify(new URL('../lib/ai-budget.ts',import.meta.url).href)).replace("'./ai-denylist'",JSON.stringify(new URL('../lib/ai-denylist.ts',import.meta.url).href)).replace("'./ai-kill-switch'",JSON.stringify(new URL('../lib/ai-kill-switch.ts',import.meta.url).href)).replace("'./ai-failover'",JSON.stringify(new URL('../lib/ai-failover.ts',import.meta.url).href)).replace('30000','5');
const {prepareAiNews,readAiNews,aiNewsRetrySeconds}=await import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64')}`);
const now=Date.UTC(2026,9,15,12,0,0)/1000,budget={dailyBudgetMicro:970000,gatewayId:'harimu-test'},id='kindle:2026-10-15';
const news={nationId:'kindle',title:'Kindle Press',style:'press',fetchedAt:now*1000,statistics:{citizens:2,completedShifts:3,food:12},items:[]};
const draft={title:'Ledger record',summary:'The public ledger records settled work and food.',claims:['completedShifts']};
// supported=false makes the verifier reject the draft after the gateway answered: failure_code 'validation'.
const gateway=(supported=true)=>{const calls=[];return {calls,async run(){calls.push(1);return {response:[JSON.stringify(draft),JSON.stringify({supported}),'safe'][calls.length-1]};}};};
const spyWarn=t=>{const seen=[];const original=console.warn;console.warn=(...args)=>{seen.push(args);};t.after(()=>{console.warn=original;});return seen;};
const jobRow=r=>r.db.prepare('SELECT status,failure_code FROM ai_news_jobs WHERE id=?').bind(id).first();
const reservations=async r=>(await r.db.prepare("SELECT request_id,status FROM harimu_ai_reservations WHERE request_id LIKE 'ai-news:%' ORDER BY request_id").all()).results.map(x=>({...x}));

test('#769 a validation rejection is retried once after aiNewsRetrySeconds and the retry publishes',async t=>{
 const r=await localRuntime();t.after(()=>r.close());const warns=spyWarn(t);const bad=gateway(false);
 await prepareAiNews(r.db,news,now,bad,{enabled:true,budget});
 assert.equal(bad.calls.length,2);assert.deepEqual({...await jobRow(r)},{status:'failed',failure_code:'validation'});
 assert.deepEqual(warns,[['[ai-news] failed',id,'validation']],'code only, never prompt or reply text');
 const early=gateway();await prepareAiNews(r.db,news,now+aiNewsRetrySeconds-1,early,{enabled:true,budget});assert.equal(early.calls.length,0,'not before aiNewsRetrySeconds');
 const good=gateway();await prepareAiNews(r.db,news,now+aiNewsRetrySeconds,good,{enabled:true,budget});
 assert.equal(good.calls.length,3);assert.equal((await jobRow(r)).status,'published');
 const items=await readAiNews(r.db,'kindle');assert.equal(items.length,1);assert.equal(items[0].title,'Ledger record');
 // Each attempt has its own reservation; nothing pending is left and nothing was reserved twice.
 assert.deepEqual(await reservations(r),[{request_id:`ai-news:${id}:${now}`,status:'finished'},{request_id:`ai-news:${id}:${now+aiNewsRetrySeconds}`,status:'finished'}]);
});
test('#769 at most two gateway attempts per nation per UTC day',async t=>{
 const r=await localRuntime();t.after(()=>r.close());const warns=spyWarn(t);
 for(const at of [now,now+aiNewsRetrySeconds]){const bad=gateway(false);await prepareAiNews(r.db,news,at,bad,{enabled:true,budget});assert.equal(bad.calls.length,2);}
 const third=gateway();await prepareAiNews(r.db,news,now+3*aiNewsRetrySeconds,third,{enabled:true,budget});
 assert.equal(third.calls.length,0);assert.equal((await reservations(r)).length,2);assert.equal(warns.length,2);
 assert.equal((await readAiNews(r.db,'kindle')).length,0);
 // The next UTC day is a fresh job.
 const tomorrow=gateway();await prepareAiNews(r.db,news,now+86400,tomorrow,{enabled:true,budget});assert.equal(tomorrow.calls.length,3);
});
test('#769 transport failures after the gateway are still never retried, and log their code',async t=>{
 const r=await localRuntime();t.after(()=>r.close());const warns=spyWarn(t);
 await prepareAiNews(r.db,news,now,{async run(){throw Error('provider down: secret details');}},{enabled:true,budget});
 assert.deepEqual(warns,[['[ai-news] failed',id,'inference-uncertain']]);
 const ai=gateway();await prepareAiNews(r.db,news,now+3600,ai,{enabled:true,budget});assert.equal(ai.calls.length,0);
});
