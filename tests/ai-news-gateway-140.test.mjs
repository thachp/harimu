import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {localRuntime} from './helpers/local-runtime.mjs';
// #140: with the news flag on and budget available, prepareAiNews must call the gateway. No live AI is used.
const source=(await readFile(new URL('../lib/ai-news.ts',import.meta.url),'utf8')).replace("'./ai-budget'",JSON.stringify(new URL('../lib/ai-budget.ts',import.meta.url).href)).replace("'./ai-denylist'",JSON.stringify(new URL('../lib/ai-denylist.ts',import.meta.url).href)).replace("'./ai-kill-switch'",JSON.stringify(new URL('../lib/ai-kill-switch.ts',import.meta.url).href)).replace('30000','5');
const {prepareAiNews,readAiNews,aiNewsStaleLeaseSeconds,aiNewsRetrySeconds}=await import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64')}`);
// #160 flake: a real-clock `now` near 00:00 UTC let now+i or now-60+aiNewsRetrySeconds fall on the next UTC day,
// so prepareAiNews keyed a fresh job id and called the gateway (3 !== 0). Pin a fixed mid-day UTC instant instead.
const now=Date.UTC(2026,9,15,12,0,0)/1000,budget={dailyBudgetMicro:970000,gatewayId:'harimu-test'},day=new Date(now*1000).toISOString().slice(0,10);
const news={nationId:'kindle',title:'Kindle Press',style:'press',fetchedAt:now*1000,statistics:{citizens:2,completedShifts:3,food:12},items:[]};
const draft={title:'Ledger record',summary:'The public ledger records settled work and food.',claims:['completedShifts']};
const gateway=()=>{const calls=[];return {calls,async run(model,input,options){calls.push({model,options});return {response:[JSON.stringify(draft),JSON.stringify({supported:true}),'safe'][calls.length-1]};}};};
const job=async(r,status,code,started)=>r.db.prepare('INSERT INTO ai_news_jobs(id,nation_id,utc_day,started_at,status,failure_code) VALUES (?,?,?,?,?,?)').bind('kindle:'+day,'kindle',day,started,status,code).run();

test('#140 flag on + budget: news calls the gateway and publishes the model article',async t=>{
 const r=await localRuntime();t.after(()=>r.close());const ai=gateway();
 await prepareAiNews(r.db,news,now,ai,{enabled:true,budget});
 assert.equal(ai.calls.length,3);for(const c of ai.calls)assert.deepEqual(c.options,{gateway:{id:'harimu-test'}});
 const items=await readAiNews(r.db,'kindle');assert.equal(items.length,1);assert.equal(items[0].source,'model');
});
test('#140 a job that failed before reaching the gateway is retried the same day',async t=>{
 for(const code of ['budget-unavailable','not-sent']){const r=await localRuntime();t.after(()=>r.close());await job(r,'failed',code,now-aiNewsRetrySeconds-1);const ai=gateway();
  await prepareAiNews(r.db,news,now,ai,{enabled:true,budget});assert.equal(ai.calls.length,3,code);assert.equal((await readAiNews(r.db,'kindle')).length,1);}
});
test('#140 a stale running lease is retaken; a fresh one or a job that reached the gateway is not',async t=>{
 const stale=await localRuntime();t.after(()=>stale.close());await job(stale,'running',null,now-aiNewsStaleLeaseSeconds-1);const a=gateway();await prepareAiNews(stale.db,news,now,a,{enabled:true,budget});assert.equal(a.calls.length,3);
 for(const [status,code,started] of [['running',null,now-10],['failed','inference-uncertain',now-60],['failed','validation',now-60],['published',null,now-60]]){
  const r=await localRuntime();t.after(()=>r.close());await job(r,status,code,started);const ai=gateway();await prepareAiNews(r.db,news,now,ai,{enabled:true,budget});assert.equal(ai.calls.length,0,`${status}/${code}`);}
});
test('#140 deterministic fallback only when flag off, no budget or failure',async t=>{
 const r=await localRuntime();t.after(()=>r.close());const ai=gateway();const warn=t.mock.method(console,'warn',()=>{});
 await prepareAiNews(r.db,news,now,ai,{enabled:false,budget});await prepareAiNews(r.db,news,now,ai,{enabled:true,budget:null});
 assert.equal(ai.calls.length,0);assert.equal((await readAiNews(r.db,'kindle')).length,0);assert.match(String(warn.mock.calls[0]?.arguments[0]),/enabled but skipped/);
 const failing={calls:[],async run(){this.calls.push(1);throw Error('gateway 500');}};await prepareAiNews(r.db,news,now,failing,{enabled:true,budget});
 assert.equal(failing.calls.length,1);assert.equal((await readAiNews(r.db,'kindle')).length,0);
});
test('#140 GET /api/news with the flag on returns the model item first',async t=>{
 const r=await localRuntime();t.after(()=>r.close());await r.call('citizen','alice');const ai=gateway();r.setFixtureAiBinding(ai);r.setFixtureAiFlags({news:true,notables:false});
 const nation=(await r.db.prepare("SELECT nation_id FROM citizens WHERE clerk_user_id='alice'").first()).nation_id;
 const res=await r.call('news','alice');assert.equal(res.status,200);assert.ok(ai.calls.length>=1,'gateway called');
 assert.equal(ai.calls.length,3);assert.equal(res.data.items[0].source,'model',nation);
});

test('#160 a pre-gateway failure is retried at most once per aiNewsRetrySeconds, not on every load',async t=>{
 for(const at of [now+4,now-60+aiNewsRetrySeconds])assert.equal(new Date(at*1000).toISOString().slice(0,10),day,'fixture stays on one UTC day');
 const r=await localRuntime();t.after(()=>r.close());await job(r,'failed','budget-unavailable',now-60);const ai=gateway();
 for(let i=0;i<5;i++)await prepareAiNews(r.db,news,now+i,ai,{enabled:true,budget});
 assert.equal(ai.calls.length,0,'within the retry window: no retake');
 const row=await r.db.prepare('SELECT started_at,status FROM ai_news_jobs WHERE id=?').bind('kindle:'+day).first();
 assert.equal(Number(row.started_at),now-60,'the job row is not rewritten on each load');assert.equal(row.status,'failed');
 await prepareAiNews(r.db,news,now-60+aiNewsRetrySeconds,ai,{enabled:true,budget});assert.equal(ai.calls.length,3,'retried once the window passes');
});
test('#160 a run that crashed after the gateway call is not retaken, so the budget is not charged twice',async t=>{
 const r=await localRuntime();t.after(()=>r.close());const started=now-aiNewsStaleLeaseSeconds-1;
 await job(r,'running',null,started);
 // The crashed attempt had marked its reservation sent (uncertain) before calling the gateway.
 await r.db.prepare("INSERT INTO harimu_ai_reservations(request_id,utc_day,next_utc_day,model,reserved_micro,started_at,status) VALUES (?,?,?,?,?,?,'uncertain')").bind(`ai-news:kindle:${day}:${started}`,day,day,'news',1000,started).run();
 const before=(await r.db.prepare('SELECT COUNT(*) AS n FROM harimu_ai_reservations').first()).n;
 const ai=gateway();await prepareAiNews(r.db,news,now,ai,{enabled:true,budget});
 assert.equal(ai.calls.length,0);assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM harimu_ai_reservations').first()).n,before,'no second reservation');
});
test('#160 a run that crashed before the gateway is retaken and its unsent reservation released',async t=>{
 const r=await localRuntime();t.after(()=>r.close());const started=now-aiNewsStaleLeaseSeconds-1,old=`ai-news:kindle:${day}:${started}`;
 await job(r,'running',null,started);
 await r.db.prepare("INSERT INTO harimu_ai_reservations(request_id,utc_day,next_utc_day,model,reserved_micro,started_at,status) VALUES (?,?,?,?,?,?,'pending')").bind(old,day,day,'news',1000,started).run();
 const ai=gateway();await prepareAiNews(r.db,news,now,ai,{enabled:true,budget});
 assert.equal(ai.calls.length,3);assert.equal(await r.db.prepare('SELECT 1 FROM harimu_ai_reservations WHERE request_id=?').bind(old).first(),null,'old pending row released');
});
