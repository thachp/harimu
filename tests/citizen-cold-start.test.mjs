import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {isolateOnce,connectWithRetry} from '../lib/postgres/readiness.ts';
import {fetchWithRetry,abortableSleep} from '../lib/fetch-retry.ts';

test('readiness checks run once per key and failures retry with fresh inputs', async()=>{
 const seen=[];let fail=true;const ready=isolateOnce(async(db,b)=>{seen.push([db,b]);if(fail)throw Error('cold');});
 await assert.rejects(ready('k','db1','env1'));fail=false;await ready('k','db2','env2');await ready('k','db3','env3');
 assert.deepEqual(seen,[['db1','env1'],['db2','env2']]);
 await ready('other-config','db4','env4');assert.deepEqual(seen.at(-1),['db4','env4']);
});
test('preview accounting refreshes only after its TTL', async()=>{
 let t=0,calls=0;const run=isolateOnce(async()=>{calls++;},60_000,()=>t);
 await run('k');t=59_999;await run('k');assert.equal(calls,1);t=60_000;await run('k');assert.equal(calls,2);
});
test('connect retries within one overall budget, never stacking full timeouts', async()=>{
 let t=0;const timeouts=[];const now=()=>t;const sleep=async ms=>{t+=ms;};
 await assert.rejects(connectWithRetry(async timeout=>{timeouts.push(timeout);t+=timeout;throw Error('timeout');},{budgetMs:3000,now,sleep}),/timeout/);
 assert.ok(t<=3000,`total ${t}ms`);assert.equal(timeouts.length,2);assert.equal(timeouts[0],1500);
 let n=0;const ok=await connectWithRetry(async()=>{if(++n===1)throw Error('cold');return 'conn';},{sleep:async()=>{}});
 assert.equal(ok,'conn');assert.equal(n,2);
});
test('a failed connect never runs a query', async()=>{
 const src=(await readFile(new URL('../lib/postgres/database.ts',import.meta.url),'utf8')).replace("'./sql'",JSON.stringify(new URL('../lib/postgres/sql.ts',import.meta.url).href));
 const code=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const {PostgresDatabase}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
 let queries=0,opens=0;
 const db=new PostgresDatabase(()=>connectWithRetry(async()=>{opens++;const client={query:async()=>{queries++;return {rows:[]};},release:async()=>{}};throw Object.assign(Error('connect failed'),{client});},{sleep:async()=>{}}),{journalRetentionApproved:true});
 await assert.rejects(db.prepare("UPDATE citizens SET capacity=1").run(),/PostgreSQL connection unavailable/);
 await assert.rejects(db.batch([db.prepare("INSERT INTO t VALUES (1)")]),/PostgreSQL connection unavailable/);
 assert.equal(opens,4);assert.equal(queries,0);
});
test('citizen GET retries dropped connections and gateway errors with backoff', async()=>{
 const waits=[];let n=0;
 const fetcher=async()=>{n++;if(n===1)throw new TypeError('Failed to fetch');if(n===2)return new Response('',{status:503});return new Response('{}',{status:200});};
 const response=await fetchWithRetry('/api/citizen',{},{fetcher,sleep:async ms=>{waits.push(ms);}});
 assert.equal(response.status,200);assert.deepEqual(waits,[500,1000]);
});
test('citizen GET does not retry auth errors, aborts, or POSTs', async()=>{
 let n=0;const r=await fetchWithRetry('/api/citizen',{},{fetcher:async()=>{n++;return new Response('',{status:401});},sleep:async()=>{}});
 assert.equal(r.status,401);assert.equal(n,1);
 const c=new AbortController();c.abort();n=0;
 await assert.rejects(fetchWithRetry('/api/citizen',{signal:c.signal},{fetcher:async()=>{n++;throw new DOMException('Aborted','AbortError');},sleep:async()=>{}}));assert.equal(n,1);
 await assert.rejects(fetchWithRetry('/api/citizen',{method:'POST'}),/only retries GET/);
});
test('aborting during backoff stops waiting at once and clears the timer', async()=>{
 const c=new AbortController();let n=0;const started=Date.now();
 const pending=fetchWithRetry('/api/citizen',{signal:c.signal},{baseMs:10_000,fetcher:async()=>{n++;return new Response('',{status:503});}});
 setTimeout(()=>c.abort(),20);
 await assert.rejects(pending,{name:'AbortError'});assert.ok(Date.now()-started<1000);assert.equal(n,1);
 const c2=new AbortController();c2.abort();await assert.rejects(abortableSleep(10_000,c2.signal),{name:'AbortError'});
});
test('wiring: db memoizes readiness, driver bounds connects, page retries the citizen GET', ()=>{
 const db=readFileSync(new URL('../lib/db.ts',import.meta.url),'utf8');
 assert.match(db,/const key=await readinessKey\(bindings\);\s*await postgresReady\(key,database,bindings\)/);assert.match(db,/crypto\.subtle\.digest\('SHA-256'/);assert.doesNotMatch(db,/reserveAi|prebookNewsAcceptance|reconcileAiAcceptanceCharges|harimu_ai_reservations/);assert.doesNotMatch(db,/PRICE_REVIEWED_UNTIL/);
 const driver=readFileSync(new URL('../lib/postgres/driver.ts',import.meta.url),'utf8');
 assert.match(driver,/connectWithRetry\(/);assert.match(driver,/connectBudgetMillis=3000/);assert.match(driver,/budgetMs:connectBudgetMillis/);
 const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
 assert.match(page,/fetchWithRetry\('\/api\/citizen', \{ signal: controller\.signal \}\)/);
});
