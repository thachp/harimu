import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {localRuntime} from './helpers/local-runtime.mjs';
import {markAiReservationSent,expireStaleAiReservations,aiBudgetConfig,readAiBudget,reserveAiSequence,aiPendingExpirySeconds,aiNewsSequenceReservation} from '../lib/ai-budget.ts';
// #92: preview showed 959,000/970,000 reserved for today and tomorrow with zero gateway requests.
const load=async(patch=s=>s)=>{const source=patch((await readFile(new URL('../lib/ai-news.ts',import.meta.url),'utf8')).replace("'./ai-budget'",JSON.stringify(new URL('../lib/ai-budget.ts',import.meta.url).href)).replace("'./ai-denylist'",JSON.stringify(new URL('../lib/ai-denylist.ts',import.meta.url).href)).replace('30000','5'));return import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64')}`);};
const now=Math.floor(Date.now()/1000),budget={dailyBudgetMicro:970000,gatewayId:'harimu-test'};
const news={nationId:'kindle',title:'Kindle Press',style:'press',fetchedAt:now*1000,statistics:{citizens:2,completedShifts:3,food:12},items:[]};
const count=async r=>(await r.db.prepare('SELECT COUNT(*) AS n FROM harimu_ai_reservations').first()).n;

test('#92 readiness with flags off reserves nothing',async t=>{
 const db=await readFile(new URL('../lib/db.ts',import.meta.url),'utf8');
 assert.doesNotMatch(db,/reserveAi|prebookNewsAcceptance|reconcileAiAcceptanceCharges|harimu_ai_reservations|ai-acceptance-charges/);
 const r=await localRuntime();t.after(()=>r.close());
 for(const route of ['news','notables'])await r.call(route,'alice');
 assert.equal(await count(r),0);assert.equal((await readAiBudget(r.db,now)).reservedMicroUsd,0);
});

test('#92 flag off or gateway missing makes no reservation and no call',async t=>{
 const {prepareAiNews}=await load();const r=await localRuntime();t.after(()=>r.close());let calls=0;const binding={async run(){calls++;}};
 await prepareAiNews(r.db,news,now,binding,{enabled:false,budget});
 await prepareAiNews(r.db,news,now,binding,{enabled:true,budget:aiBudgetConfig({HARIMU_AI_DAILY_BUDGET_MICRO:'970000'},now)});
 assert.ok((await r.answerNotable('alice',{requestId:randomUUID(),notableId:'kindle-journalist',topic:'news'},binding,{enabled:false,budget})).status>=400);
 assert.equal(calls,0);assert.equal(await count(r),0);
});

test('#92 a failure before the gateway call releases the reservation',async t=>{
 const {prepareAiNews}=await load(s=>s.replace('>12000','>10'));const r=await localRuntime();t.after(()=>r.close());let calls=0;
 await prepareAiNews(r.db,news,now,{async run(){calls++;}},{enabled:true,budget});
 assert.equal(calls,0);assert.equal(await count(r),0);
 assert.equal((await r.db.prepare('SELECT failure_code FROM ai_news_jobs').first()).failure_code,'not-sent');
});

test('#92 a failure after the gateway call keeps its charge',async t=>{
 const {prepareAiNews}=await load();const r=await localRuntime();t.after(()=>r.close());
 await prepareAiNews(r.db,news,now,{async run(){throw Error('network');}},{enabled:true,budget});
 const row=await r.db.prepare('SELECT reserved_micro,status FROM harimu_ai_reservations').first();assert.equal(row.reserved_micro,aiNewsSequenceReservation);assert.equal(row.status,'uncertain');
});

test('#92 stale pending rows expire and stop counting; fresh pending and uncertain rows still count',async t=>{
 const r=await localRuntime();t.after(()=>r.close());const day=new Date(now*1000).toISOString().slice(0,10),next=new Date((now+86400)*1000).toISOString().slice(0,10);
 const insert=(id,cost,started,status)=>r.db.prepare('INSERT INTO harimu_ai_reservations(request_id,utc_day,next_utc_day,model,reserved_micro,started_at,status) VALUES (?,?,?,?,?,?,?)').bind(id,day,next,'@cf/meta/llama-3.2-3b-instruct',cost,started,status).run();
 await insert('stale',900000,now-aiPendingExpirySeconds-1,'pending');
 assert.equal((await readAiBudget(r.db,now)).reservedMicroUsd,0);
 assert.equal(await reserveAiSequence(r.db,randomUUID(),now,budget),true);
 assert.equal(await r.db.prepare("SELECT 1 AS x FROM harimu_ai_reservations WHERE request_id='stale'").first(),null);
 await insert('fresh',4200,now-10,'pending');await insert('unsure',4200,now-aiPendingExpirySeconds-1,'uncertain');
 assert.equal((await readAiBudget(r.db,now)).reservedMicroUsd,aiNewsSequenceReservation+8400);
});

test('#92 preview cleanup SQL releases only the unsent acceptance rows and is idempotent',async t=>{
 const sql=(await readFile(new URL('../db/postgres/maintenance/092_release_unspent_ai_reservations.sql',import.meta.url),'utf8')).split('\n').filter(l=>!l.startsWith('--')).join('\n').split(';').map(s=>s.trim()).filter(Boolean);
 const r=await localRuntime();t.after(()=>r.close());
 assert.equal(await reserveAiSequence(r.db,'real-1',now,budget),true);
 await r.db.prepare("INSERT INTO harimu_ai_reservations VALUES ('acceptance:2026-10-14:news-final','2026-10-14','2026-10-15','x',959000,1,'finished')").run();
 for(let i=0;i<2;i++)for(const s of sql)await r.db.prepare(s).run();
 assert.deepEqual((await r.db.prepare('SELECT request_id FROM harimu_ai_reservations').all()).results.map(x=>x.request_id),['real-1']);
});

test('#92 a row marked sent before the gateway call never expires or gets released, even with no terminal update',async t=>{
 const r=await localRuntime();t.after(()=>r.close());const old=now-aiPendingExpirySeconds-10;
 assert.equal(await reserveAiSequence(r.db,'sent-1',old,budget),true);assert.equal(await reserveAiSequence(r.db,'unsent-1',old,budget),true);
 await markAiReservationSent(r.db,'sent-1'); // Worker evicted mid binding.run: no catch/success update ever runs
 await expireStaleAiReservations(r.db,now);
 const {releaseAiReservation}=await import('../lib/ai-budget.ts');await releaseAiReservation(r.db,'sent-1');
 assert.deepEqual((await r.db.prepare('SELECT request_id,status FROM harimu_ai_reservations').all()).results.map(x=>({...x})),[{request_id:'sent-1',status:'uncertain'}]);
 assert.equal((await readAiBudget(r.db,now)).reservedMicroUsd,aiNewsSequenceReservation);
});
test('#92 news marks its row sent before the first gateway call',async t=>{
 const {prepareAiNews}=await load();const r=await localRuntime();t.after(()=>r.close());let seen;
 await prepareAiNews(r.db,news,now,{async run(){seen=(await r.db.prepare('SELECT status FROM harimu_ai_reservations').first()).status;throw Error('evicted');}},{enabled:true,budget});
 assert.equal(seen,'uncertain');
});
test('#92 a repeated Notable request id is still rejected after the expiry pass',async t=>{
 const r=await localRuntime();t.after(()=>r.close());const c={requestId:randomUUID(),notableId:'kindle-journalist',topic:'news'};let calls=0;
 const binding={async run(){calls++;throw Error('evicted');}};
 await r.call('notables','alice');const first=await r.answerNotable('alice',c,binding,{enabled:true,budget});
 await expireStaleAiReservations(r.db,now+aiPendingExpirySeconds*3);
 const again=await r.answerNotable('alice',c,binding,{enabled:true,budget});
 assert.notEqual(first.status,409);assert.equal(again.status,409);assert.equal(calls,1);
});

test('#92 legacy phantom rows (9 rows, 959,000 on Oct 14 and 15) are released in-app; real sent/uncertain rows are untouched',async t=>{
 const at=Date.parse('2026-10-14T13:00:00Z')/1000,n='notable-question-3b-double-guard-2026-10-14',s='@cf/meta/llama-3.2-3b-instruct';
 const legacy=[['generation-probe',s,4200,1791965562,'finished'],['notable-1',n,136400,1791965661,'finished'],['notable-2',n,136400,1791965778,'finished'],['notable-3',n,136400,1791965827,'finished'],['notable-4',n,136400,1791965931,'finished'],['notable-5',n,136400,1791965992,'finished'],['notable-6',n,136400,1791966068,'finished'],['moderation-probe','@cf/meta/llama-guard-3-8b',64000,1791966223,'finished'],['news-final','news-sequence-3b-guard-2026-10-14',72400,1791966300,'finished']];
 assert.equal(legacy.reduce((a,x)=>a+x[2],0),959000);
 const r=await localRuntime();t.after(()=>r.close());const ins=(id,model,cost,started,status)=>r.db.prepare('INSERT INTO harimu_ai_reservations(request_id,utc_day,next_utc_day,model,reserved_micro,started_at,status) VALUES (?,?,?,?,?,?,?)').bind(id,'2026-10-14','2026-10-15',model,cost,started,status).run();
 for(const [id,...rest] of legacy)await ins('acceptance:2026-10-14:'+id,...rest);
 await ins('real-finished',s,4200,at-60,'finished');await ins('notable:'+'a'.repeat(64)+':'+randomUUID(),s,4200,at-7200,'uncertain');
 // Budget read already ignores them (before any write runs).
 assert.equal((await readAiBudget(r.db,at,budget)).reservedMicroUsd,8400);assert.equal((await readAiBudget(r.db,at+86400,budget)).reservedMicroUsd,8400);
 assert.equal(await reserveAiSequence(r.db,'fresh-1',at,budget),true); // the next reservation deletes them
 await expireStaleAiReservations(r.db,at); // idempotent second pass
 const rows=(await r.db.prepare('SELECT request_id,status FROM harimu_ai_reservations ORDER BY request_id').all()).results;
 assert.equal(rows.filter(x=>x.request_id.startsWith('acceptance:')).length,0);
 assert.deepEqual(rows.map(x=>x.status).sort(),['finished','pending','uncertain']);
 assert.equal((await readAiBudget(r.db,at,budget)).remainingMicroUsd,970000-8400-aiNewsSequenceReservation);
});
