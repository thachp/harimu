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
 let redeemed;const book=nodes(exports.CouponBook({coupons:buildCoupons(false,new Set(),'2026-01-01T00:00:00.000Z'),walletMinor:800,clothing:0,goods:0,reason:null,onRedeem:k=>{redeemed=k;},onFood(){}}));
 assert.match(text(book),/cannot be traded or sent/);assert.match(text(book),/2\.00\s*LN fixed price/);
 const buttons=book.filter(n=>typeof n?.props?.onClick==='function'&&n.props.reason!==undefined);buttons[1].props.onClick();assert.equal(redeemed,'goods');
});
