import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { localRuntime } from './helpers/local-runtime.mjs';
import { quotaPercent, buildCoupons, korundCouponGoods, korundWeeklyQuotaFood } from '../lib/korund-coupons.ts';
const require=createRequire(import.meta.url);

async function fixture(t){const r=await localRuntime();t.after(()=>r.close());await r.db.prepare("UPDATE citizens SET nation_id='korund'").run();await r.call('world',null);return r;}
const coupon=(kind,requestId=randomUUID(),extra={})=>({action:'korund-redeem-coupon',requestId,coupon:kind,...extra});
async function work(r,user){const id=randomUUID();assert.equal((await r.call('citizen',user,{action:'korund-start-work',requestId:id})).status,200);r.setNow(r.now+7200*1000);const c=await r.call('citizen',user,{action:'korund-claim-work',shiftId:id,requestId:randomUUID()});assert.equal(c.status,200,c.data.error);return c.data.korundPlan;}

test('helpers: quota percent clamps and coupon book lists food, clothing and goods',()=>{
 assert.equal(quotaPercent(0),0);assert.equal(quotaPercent(20),50);assert.equal(quotaPercent(400),100);assert.equal(korundWeeklyQuotaFood,40);
 const book=buildCoupons(true,new Set(['goods']),'2026-01-01T00:00:00.000Z');assert.deepEqual(book.map(c=>[c.kind,c.used]),[['food',true],['clothing',false],['goods',true]]);
});

test('Korund citizen sees weekly coupons with expiry; redeeming charges the fixed LN price and consumes the coupon',async t=>{
 const r=await fixture(t);const first=(await r.call('citizen','alice')).data;const plan=first.korundPlan;const epoch=first.simulation.clock.epochSeconds;
 assert.deepEqual(plan.coupons.map(c=>[c.kind,c.used,c.priceMinor]),[['food',false,0],['clothing',false,200],['goods',false,300]]);
 for(const c of plan.coupons)assert.equal(Date.parse(c.expiresAt)/1000,epoch+50400);
 assert.equal((await r.call('citizen','alice',coupon('clothing'))).status,409,'no LN yet');
 const paid=await work(r,'alice');assert.equal(paid.walletMinor,800);
 const id=randomUUID();const redeemed=await r.call('citizen','alice',coupon('clothing',id));assert.equal(redeemed.status,200,redeemed.data.error);
 const after=redeemed.data.korundPlan;assert.equal(after.walletMinor,800-korundCouponGoods.clothing.priceMinor);assert.equal(after.clothingQuantity,1);
 assert.equal(after.coupons.find(c=>c.kind==='clothing').used,true);
 assert.equal((await r.call('citizen','alice',coupon('clothing',id))).data.replayed,true,'same request replays');
 assert.equal((await r.call('citizen','alice',coupon('clothing'))).status,409,'coupon consumed');
 const goods=await r.call('citizen','alice',coupon('goods'));assert.equal(goods.status,200);assert.equal(goods.data.korundPlan.walletMinor,300);assert.equal(goods.data.korundPlan.goodsQuantity,1);
});

test('coupons cannot be traded or sent and unused coupons disappear at the weekly reset',async t=>{
 const r=await fixture(t);const epoch=(await r.call('citizen','alice')).data.simulation.clock.epochSeconds;
 await work(r,'alice');
 const id=randomUUID();
 assert.equal((await r.call('citizen','alice',coupon('clothing',randomUUID(),{recipient:'bob'}))).status,400);
 assert.equal((await r.call('citizen','alice',coupon('food'))).status,400,'food coupons use the ration counter');
 assert.equal((await r.call('citizen','alice',{action:'korund-transfer-coupon',requestId:randomUUID(),coupon:'clothing',to:'bob'})).status,400);
 assert.equal((await r.call('citizen','alice',coupon('clothing',id))).status,200);
 assert.equal((await r.call('citizen','bob',coupon('clothing',id))).status,409,'another citizen cannot reuse the receipt');
 assert.equal((await r.call('citizen','bob')).data.korundPlan.clothingQuantity,0);
 r.setNow((epoch+50400)*1000);
 const next=(await r.call('citizen','alice')).data.korundPlan;assert.equal(next.gameWeek,2);
 assert.deepEqual(next.coupons.map(c=>c.used),[false,false,false],'new week issues a fresh book; last week’s unused goods coupon is gone');
 assert.equal(Date.parse(next.coupons[0].expiresAt)/1000,epoch+100800);
 assert.equal(next.clothingQuantity,1,'redeemed items stay in the household');
});

test('completing a shift moves the work-unit quota bar for the unit and the citizen',async t=>{
 const r=await fixture(t);const before=(await r.call('citizen','alice')).data.korundPlan.quota;
 assert.deepEqual([before.unitFood,before.ownFood,before.targetFood],[0,0,40]);
 const a=await work(r,'alice');assert.deepEqual([a.quota.unitFood,a.quota.ownFood],[4,4]);
 const b=(await r.call('citizen','bob')).data.korundPlan.quota;assert.deepEqual([b.unitFood,b.ownFood],[4,0]);
 await work(r,'bob');const after=(await r.call('citizen','alice')).data.korundPlan.quota;assert.deepEqual([after.unitFood,after.ownFood],[8,4]);
});

test('quota bar and coupon book render',async()=>{
 const js=ts.transpileModule(await readFile(new URL('../app/korund-plan-panel.tsx',import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText;
 const exports={};new Function('exports','require',js)(exports,name=>name==='./display-preferences'?{useDisplayTimestamp:()=>String}:name==='./game-timer'?{GameTimer:()=>null}:name==='./nation-document'?{NationDocument:()=>null}:name==='./action-button'?{ActionButton:()=>null}:name==='@/lib/action-reasons'?require('../lib/action-reasons.ts'):name==='@/lib/korund-coupons'?require('../lib/korund-coupons.ts'):name==='../lib/game-time'?require('../lib/game-time.ts'):name==='react'?{useState:i=>[i,()=>{}],useEffect(){}}:require(name));
 const nodes=n=>!n||typeof n!=='object'?[n]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)];
 const text=t=>t.filter(n=>typeof n==='string'||typeof n==='number').join(' ');
 const bar=nodes(exports.QuotaBar({quota:{workUnit:'Brigade',targetFood:40,unitFood:10,ownFood:4,weekStartsAt:'',weekEndsAt:''}}));
 const pb=bar.find(n=>n?.props?.role==='progressbar');assert.equal(pb.props['aria-valuenow'],10);assert.match(text(bar),/25\s*%/);
 let redeemed;const book=nodes(exports.CouponBook({now:Date.parse('2025-12-31T00:00:00.000Z'),coupons:buildCoupons(false,new Set(),'2026-01-01T00:00:00.000Z'),walletMinor:800,clothing:0,goods:0,reason:null,onRedeem:k=>{redeemed=k;},onFood(){}}));
 assert.match(text(book),/cannot be traded or sent/);assert.match(text(book),/2\.00\s*LN fixed price/);
 const buttons=book.filter(n=>typeof n?.props?.onClick==='function'&&n.props.reason!==undefined);buttons[1].props.onClick();assert.equal(redeemed,'goods');
});

test('review fix: an expired coupon book cannot spend the new week (UI disabled, server checks week)',async t=>{
 const js=ts.transpileModule(await readFile(new URL('../app/korund-plan-panel.tsx',import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText;
 const exports={};new Function('exports','require',js)(exports,name=>name==='./display-preferences'?{useDisplayTimestamp:()=>String}:name==='./game-timer'?{GameTimer:()=>null}:name==='./nation-document'?{NationDocument:()=>null}:name==='./action-button'?{ActionButton:()=>null}:name==='@/lib/action-reasons'?require('../lib/action-reasons.ts'):name==='@/lib/korund-coupons'?require('../lib/korund-coupons.ts'):name==='../lib/game-time'?require('../lib/game-time.ts'):name==='react'?{useState:i=>[i,()=>{}],useEffect(){}}:require(name));
 const nodes=n=>!n||typeof n!=='object'?[n]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)];
 const book=nodes(exports.CouponBook({now:Date.parse('2026-01-01T00:00:01.000Z'),coupons:buildCoupons(false,new Set(),'2026-01-01T00:00:00.000Z'),walletMinor:800,clothing:0,goods:0,reason:null,onRedeem(){},onFood(){}}));
 const reasons=book.filter(n=>n?.props?.reason!==undefined&&typeof n.props.onClick==='function').map(n=>n.props.reason);
 assert.equal(reasons.length,2);for(const r of reasons)assert.match(r,/expired at the weekly reset/);
 const r=await fixture(t);const first=(await r.call('citizen','alice')).data;const epoch=first.simulation.clock.epochSeconds;
 await work(r,'alice');r.setNow((epoch+50400)*1000);
 const stale=await r.call('citizen','alice',coupon('clothing',randomUUID(),{gameWeek:1}));assert.equal(stale.status,409);assert.match(stale.data.error,/expired/);
 assert.equal(stale.data.korundPlan.walletMinor,800);assert.equal(stale.data.korundPlan.coupons.find(c=>c.kind==='clothing').used,false);
 assert.equal((await r.call('citizen','alice',coupon('clothing',randomUUID(),{gameWeek:2}))).status,200);
 assert.equal((await r.call('citizen','alice',coupon('goods',randomUUID(),{gameWeek:0}))).status,400);
});

// QA1 review (#58): concurrent LN redemptions must never drive the balance negative.
async function fourLaborNotes(t){
 const r=await fixture(t);const epoch=(await r.call('citizen','alice')).data.simulation.clock.epochSeconds;
 await work(r,'alice'); // 8.00 LN
 for(const week of [1,2])await r.db.prepare("INSERT INTO korund_coupon_redemptions(id,clerk_user_id,game_week,coupon,item,quantity,price_minor,occurred_at) VALUES (?,?,?,'clothing','state work clothing',1,200,?)").bind(randomUUID(),'alice',week,epoch).run();
 r.setNow((epoch+2*50400+60)*1000); // game week 3, 4.00 LN left
 assert.equal((await r.call('citizen','alice')).data.korundPlan.walletMinor,400);
 return {r,epoch};
}
test('race: clothing + goods redeemed in parallel with 4.00 LN — exactly one succeeds, LN never negative',async t=>{
 const {r}=await fourLaborNotes(t);
 const results=await Promise.all([r.call('citizen','alice',coupon('clothing')),r.call('citizen','alice',coupon('goods'))]);
 assert.equal(results.filter(x=>x.status===200).length,1);
 const plan=(await r.call('citizen','alice')).data.korundPlan;assert.ok(plan.walletMinor>=0);assert.ok([100,200].includes(plan.walletMinor));
});
test('race: a rival redemption committed between the guard and the re-check is detected and withdrawn',async t=>{
 const {r}=await fourLaborNotes(t);
 const prepare=r.db.prepare.bind(r.db);let injected=false;
 // Simulates READ COMMITTED: the rival goods row (3.00) commits after our INSERT guard passed but before our re-check.
 r.db.prepare=sql=>{if(!injected&&/AS balance$/.test(sql.trim())){injected=true;r.db.prepare=prepare;prepare("INSERT INTO korund_coupon_redemptions(id,clerk_user_id,game_week,coupon,item,quantity,price_minor,occurred_at) VALUES (?,?,3,'goods','household goods bundle',1,300,0)").bind(randomUUID(),'alice').run();}return prepare(sql);};
 const res=await r.call('citizen','alice',coupon('clothing'));
 assert.equal(injected,true);assert.equal(res.status,409);
 const plan=res.data.korundPlan;assert.equal(plan.walletMinor,100,'only the rival goods redemption remains');assert.equal(plan.coupons.find(c=>c.kind==='clothing').used,false);
});
// QA1 review: quota window is [weekStart, weekEnd) — a settlement exactly at the boundary belongs to the new week.
test('quota week boundary: settlement at end-1s counts in week 1; at exactly end counts in week 2',async t=>{
 const r=await fixture(t);const epoch=(await r.call('citizen','alice')).data.simulation.clock.epochSeconds;const end=epoch+50400;
 const shiftAt=async(user,claimAt)=>{r.setNow((claimAt-7200)*1000);const id=randomUUID();assert.equal((await r.call('citizen',user,{action:'korund-start-work',requestId:id})).status,200);r.setNow(claimAt*1000);assert.equal((await r.call('citizen',user,{action:'korund-claim-work',shiftId:id,requestId:randomUUID()})).status,200);};
 await shiftAt('alice',end-1);
 let q=(await r.call('citizen','alice')).data.korundPlan.quota;assert.deepEqual([q.unitFood,q.ownFood],[4,4]);assert.equal(Date.parse(q.weekEndsAt)/1000,end);
 await shiftAt('bob',end);
 q=(await r.call('citizen','alice')).data.korundPlan.quota;assert.equal(Date.parse(q.weekStartsAt)/1000,end);assert.deepEqual([q.unitFood,q.ownFood],[4,0],'week 2 has only the settlement at exactly its start');
});
