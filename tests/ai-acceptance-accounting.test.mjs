import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {localRuntime} from './helpers/local-runtime.mjs';
import {readAiBudget,reserveAiSequence} from '../lib/ai-budget.ts';
const now=Date.parse('2026-10-14T09:00:00Z')/1000;
test('actual acceptance charges reconcile once into the shared ledger, preserving both windows and uncertainty',async t=>{
 const r=await localRuntime();t.after(()=>r.close());r.setNow(now*1000);await Promise.all([r.reconcileAcceptanceCharges(),r.reconcileAcceptanceCharges()]);await r.reconcileAcceptanceCharges();
 const row=await r.db.prepare("SELECT COUNT(*) AS n,SUM(reserved_micro) AS cost,SUM(CASE WHEN status='uncertain' THEN 1 ELSE 0 END) AS uncertain FROM harimu_ai_reservations").first();assert.deepEqual({...row},{n:8,cost:886600,uncertain:0});
 const budget=await readAiBudget(r.db,now);assert.equal(budget.reservedMicroUsd,886600);assert.equal(budget.nextDayReservedMicroUsd,886600);assert.equal(budget.remainingMicroUsd,83400);assert.equal(budget.blocked,false);
 assert.equal(await reserveAiSequence(r.db,randomUUID(),now,{dailyBudgetMicro:970000,gatewayId:'harimu-test'},undefined,true),false);
 const news=await Promise.all([reserveAiSequence(r.db,randomUUID(),now,{dailyBudgetMicro:970000,gatewayId:'harimu-test'}),reserveAiSequence(r.db,randomUUID(),now,{dailyBudgetMicro:970000,gatewayId:'harimu-test'})]);assert.equal(news.filter(Boolean).length,1);
 assert.equal((await readAiBudget(r.db,now)).reservedMicroUsd,959000);
 const tomorrow=await readAiBudget(r.db,now+86400);assert.equal(tomorrow.reservedMicroUsd,959000);assert.equal(tomorrow.blocked,true);assert.equal(await reserveAiSequence(r.db,randomUUID(),now+86400,{dailyBudgetMicro:970000,gatewayId:'harimu-test'}),false);
 await r.reconcileAcceptanceCharges();assert.equal((await readAiBudget(r.db,now)).reservedMicroUsd,959000);
});
test('accounting collisions fail closed instead of overwriting/refunding an existing charge',async t=>{
 const r=await localRuntime();t.after(()=>r.close());r.setNow(now*1000);await r.reconcileAcceptanceCharges();await r.db.prepare("UPDATE harimu_ai_reservations SET reserved_micro=136401 WHERE request_id='acceptance:2026-10-14:notable-1'").run();await assert.rejects(r.reconcileAcceptanceCharges(),/accounting mismatch/);assert.equal((await readAiBudget(r.db,now)).reservedMicroUsd,886601);
});

test('single named news prebook uses the global guard, is idempotent and consumes both windows',async t=>{
 const r=await localRuntime();t.after(()=>r.close());r.setNow(now*1000);await r.reconcileAcceptanceCharges();assert.equal(await r.prebookNewsAcceptance(now,{dailyBudgetMicro:970000,gatewayId:'harimu-test'}),true);assert.equal(await r.prebookNewsAcceptance(now,{dailyBudgetMicro:970000,gatewayId:'harimu-test'}),true);const budget=await readAiBudget(r.db,now);assert.equal(budget.reservedMicroUsd,959000);assert.equal(budget.nextDayReservedMicroUsd,959000);assert.equal(budget.remainingMicroUsd,11000);assert.equal((await r.db.prepare("SELECT status FROM harimu_ai_reservations WHERE request_id='acceptance:2026-10-14:news-final'").first()).status,'finished');assert.equal(await reserveAiSequence(r.db,randomUUID(),now,{dailyBudgetMicro:970000,gatewayId:'harimu-test'}),false);
});

test('approved exact terminal failures reconcile once, preserve every financial field and leave unrelated uncertainty alone',async t=>{
 const r=await localRuntime();t.after(()=>r.close());r.setNow(now*1000);await r.seedOriginalAcceptanceCharges();const before=(await r.db.prepare('SELECT * FROM harimu_ai_reservations ORDER BY request_id').all()).results;assert.equal(before.filter(row=>row.status==='uncertain').length,3);
 await r.db.prepare("INSERT INTO harimu_ai_reservations VALUES ('unrelated-unknown','2026-10-14','2026-10-15','@cf/meta/llama-3.2-3b-instruct',4200,?,'uncertain')").bind(now).run();
 await Promise.all([r.reconcileAcceptanceCharges(),r.reconcileAcceptanceCharges()]);await r.reconcileAcceptanceCharges();const after=(await r.db.prepare("SELECT * FROM harimu_ai_reservations WHERE request_id!='unrelated-unknown' ORDER BY request_id").all()).results;assert.deepEqual(after.map(row=>({...row})),before.map(row=>({...row,status:'finished'})));assert.equal((await r.db.prepare("SELECT status FROM harimu_ai_reservations WHERE request_id='unrelated-unknown'").first()).status,'uncertain');assert.equal((await readAiBudget(r.db,now)).reservedMicroUsd,890800);assert.equal((await readAiBudget(r.db,now+86400)).blocked,true);if(r.storageEngine==='postgres'){const audit=(await r.db.prepare("SELECT statements_json FROM harimu_postgres_write_journal WHERE statements_json LIKE '%approved-known-failed%'").all()).results;assert.equal(audit.length,1);const transitions=JSON.parse(audit[0].statements_json);assert.equal(transitions.length,3);assert.ok(transitions.every(s=>s.sql.includes("status='uncertain'")&&s.values.some(v=>typeof v==='string'&&v.includes('AI_TERMINAL_FAILURE_EVIDENCE.json'))&&s.values.at(-1)===now));}
});

test('terminal reconciliation rejects an identity/timestamp mismatch before changing any target',async t=>{
 const r=await localRuntime();t.after(()=>r.close());r.setNow(now*1000);await r.seedOriginalAcceptanceCharges();await r.db.prepare("UPDATE harimu_ai_reservations SET started_at=started_at+1 WHERE request_id='acceptance:2026-10-14:notable-2'").run();await assert.rejects(r.reconcileAcceptanceCharges(),/accounting mismatch/);assert.equal((await r.db.prepare("SELECT COUNT(*) AS n FROM harimu_ai_reservations WHERE status='uncertain'").first()).n,3);assert.equal((await readAiBudget(r.db,now)).reservedMicroUsd,886600);
});

test('evidence artifact hash matches the journaled immutable reference',async()=>{
 const {readFile}=await import('node:fs/promises'),{createHash}=await import('node:crypto');const evidence=await readFile(new URL('../docs/AI_TERMINAL_FAILURE_EVIDENCE.json',import.meta.url));const source=await readFile(new URL('../lib/ai-acceptance-charges.ts',import.meta.url),'utf8');assert.ok(source.includes(createHash('sha256').update(evidence).digest('hex')));const data=JSON.parse(evidence);assert.deepEqual(data.entries.map(e=>e.ledgerId),['acceptance:2026-10-14:notable-1','acceptance:2026-10-14:notable-2','acceptance:2026-10-14:notable-5']);assert.ok(data.entries.every(e=>e.noDownstreamRequestFiles&&e.reservedMicroUsd===136400));
});
