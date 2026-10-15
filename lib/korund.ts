import type {GameDatabase} from './database-contract';
import {activeRationQueue,readRationQueue,executeRationQueue,queueIdentifierUsed,type RationQueue} from './korund-queue';
import type { WorkShift } from './work-shifts';
import { readBureau, setPreferences, requestAssignment, type BureauView } from './labor-bureau';
import {readCouponsAndQuota,korundCouponGoods,korundCouponRedeemSql,type KorundCoupon,type KorundQuota} from './korund-coupons';
export const korundJob = {id:'korund-food-production',name:'State food-production brigade',capacityCost:4,hours:2,wageMinor:800,foodOutput:4} as const;
export const gameWeekSeconds = 50400;
export const korundSchemas = [
 `CREATE TABLE korund_resources (id TEXT PRIMARY KEY, initial_food INTEGER NOT NULL CHECK(initial_food>=0), initial_minor INTEGER NOT NULL CHECK(initial_minor>=0))`,
 `CREATE TABLE korund_work_starts (id TEXT PRIMARY KEY REFERENCES work_shifts(id), capacity_applied INTEGER NOT NULL DEFAULT 0 CHECK(capacity_applied IN (0,1)))`,
 `CREATE TABLE korund_settlements (shift_id TEXT PRIMARY KEY REFERENCES work_shifts(id), clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id), wage_minor INTEGER NOT NULL CHECK(wage_minor=800), food_output INTEGER NOT NULL CHECK(food_output=4), settled_at INTEGER NOT NULL)`,
 `CREATE TABLE korund_rations (id TEXT PRIMARY KEY, clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id), game_week INTEGER NOT NULL CHECK(game_week>=1), quantity INTEGER NOT NULL CHECK(quantity=2), occurred_at INTEGER NOT NULL, UNIQUE(clerk_user_id,game_week))`,
 `CREATE TABLE korund_meals (id TEXT PRIMARY KEY, clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id), quantity INTEGER NOT NULL CHECK(quantity=2), occurred_at INTEGER NOT NULL, capacity_applied INTEGER NOT NULL DEFAULT 0 CHECK(capacity_applied IN (0,1)))`,
] as const;
export const korundPublicFoodSql = `SELECT initial_food+COALESCE((SELECT SUM(food_output) FROM korund_settlements),0)-COALESCE((SELECT SUM(quantity) FROM korund_rations),0) AS food, initial_minor-COALESCE((SELECT SUM(wage_minor) FROM korund_settlements),0) AS funds FROM korund_resources WHERE id='state'`;
export const korundStartSql = `INSERT OR IGNORE INTO work_shifts (id,clerk_user_id,work_order_id,order_name,output,capacity_spent,started_at,completes_at)
 SELECT ?,clerk_user_id,'korund-food-production','State food-production brigade','4 food contributed to state ration supply',4,?,? FROM citizens
 WHERE clerk_user_id=? AND nation_id='korund' AND capacity>=4 AND NOT EXISTS(SELECT 1 FROM work_shifts WHERE clerk_user_id=? AND claimed_at IS NULL)
 AND NOT EXISTS(SELECT 1 FROM korund_rations WHERE id=?) AND NOT EXISTS(SELECT 1 FROM korund_meals WHERE id=?)
 AND NOT EXISTS(SELECT 1 FROM korund_ration_queue WHERE request_id=?) AND NOT EXISTS(SELECT 1 FROM korund_queue_cancellations WHERE request_id=?)`;
export const korundStartReceiptSql = `INSERT OR IGNORE INTO korund_work_starts(id,capacity_applied) SELECT id,0 FROM work_shifts WHERE id=? AND clerk_user_id=? AND work_order_id='korund-food-production'`;
export const korundDebitSql = `UPDATE citizens SET capacity=capacity-4,updated_at=? WHERE clerk_user_id=? AND EXISTS(SELECT 1 FROM korund_work_starts k JOIN work_shifts s ON s.id=k.id WHERE k.id=? AND s.clerk_user_id=citizens.clerk_user_id AND k.capacity_applied=0)`;
export const korundSettleSql = `INSERT OR IGNORE INTO korund_settlements(shift_id,clerk_user_id,wage_minor,food_output,settled_at)
 SELECT s.id,s.clerk_user_id,800,4,? FROM work_shifts s JOIN korund_work_starts k ON k.id=s.id JOIN citizens c ON c.clerk_user_id=s.clerk_user_id
 WHERE s.id=? AND s.clerk_user_id=? AND k.capacity_applied=1 AND s.claimed_at IS NULL AND s.completes_at<=?
 AND 800<=(SELECT initial_minor-COALESCE((SELECT SUM(wage_minor) FROM korund_settlements),0) FROM korund_resources WHERE id='state')`;
export const korundRationSql = `INSERT OR IGNORE INTO korund_rations(id,clerk_user_id,game_week,quantity,occurred_at)
 SELECT ?,clerk_user_id,?,2,? FROM citizens WHERE clerk_user_id=? AND nation_id='korund'
 AND 2<=(SELECT initial_food+COALESCE((SELECT SUM(food_output) FROM korund_settlements),0)-COALESCE((SELECT SUM(quantity) FROM korund_rations),0) FROM korund_resources WHERE id='state')
 AND NOT EXISTS(SELECT 1 FROM korund_rations WHERE clerk_user_id=? AND game_week=?)
 AND NOT EXISTS(SELECT 1 FROM korund_meals WHERE id=?) AND NOT EXISTS(SELECT 1 FROM korund_work_starts WHERE id=?)
 AND NOT EXISTS(SELECT 1 FROM korund_ration_queue WHERE request_id=?) AND NOT EXISTS(SELECT 1 FROM korund_queue_cancellations WHERE request_id=?)
 AND (NOT EXISTS(SELECT 1 FROM korund_ration_queue q WHERE ${activeRationQueue}) OR EXISTS(SELECT 1 FROM korund_ration_queue q WHERE ${activeRationQueue} AND q.clerk_user_id=? AND q.seq=(SELECT MIN(q.seq) FROM korund_ration_queue q WHERE ${activeRationQueue})))`;
export const korundMealSql = `INSERT OR IGNORE INTO korund_meals(id,clerk_user_id,quantity,occurred_at)
 SELECT ?,clerk_user_id,2,? FROM citizens WHERE clerk_user_id=? AND nation_id='korund' AND capacity<24
 AND 2<=COALESCE((SELECT SUM(quantity) FROM korund_rations WHERE clerk_user_id=citizens.clerk_user_id),0)-COALESCE((SELECT SUM(quantity) FROM korund_meals WHERE clerk_user_id=citizens.clerk_user_id),0)
 AND NOT EXISTS(SELECT 1 FROM korund_meals WHERE clerk_user_id=citizens.clerk_user_id AND occurred_at>?-7200)
 AND NOT EXISTS(SELECT 1 FROM korund_rations WHERE id=?) AND NOT EXISTS(SELECT 1 FROM korund_work_starts WHERE id=?)
 AND NOT EXISTS(SELECT 1 FROM korund_ration_queue WHERE request_id=?) AND NOT EXISTS(SELECT 1 FROM korund_queue_cancellations WHERE request_id=?)`;
export type KorundPlan = { available:boolean; mode:'bounded state planning'; assignment:typeof korundJob;
 walletMinor:number;foodQuantity:number;publicFoodRemaining:number;publicFundMinor:number;
 gameWeek:number;couponFoodRemaining:number;couponExpiresAt:string;mealReadyAt:string|null;shifts:WorkShift[];queue?:RationQueue;
 coupons?:KorundCoupon[];quota?:KorundQuota;bureau?:BureauView;clothingQuantity?:number;goodsQuantity?:number };
export type KorundCommand = {action:'korund-start-work'|'korund-claim-work'|'korund-redeem-ration'|'korund-household-meal'|'korund-join-ration-queue'|'korund-cancel-ration-queue'|'korund-redeem-coupon'|'korund-set-preferences'|'korund-request-assignment'; requestId?:string;preferences?:string[];shiftId?:string;queueId?:string;coupon?:'clothing'|'goods';gameWeek?:number};
const uuid=(v:unknown):v is string=>typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export function validKorundCommand(body:Record<string,unknown>):body is Record<string,unknown>&KorundCommand {
 // #235 (flag-gated at execution): preferences are three job ids; the assignment request carries only an id.
 if(body.action==='korund-set-preferences')return uuid(body.requestId)&&Array.isArray(body.preferences)&&Object.keys(body).every(k=>['action','requestId','preferences'].includes(k));
 if(body.action==='korund-request-assignment')return uuid(body.requestId)&&Object.keys(body).every(k=>['action','requestId'].includes(k));
 if(body.action==='korund-cancel-ration-queue')return uuid(body.requestId)&&uuid(body.queueId);
 if(body.action==='korund-redeem-coupon')return uuid(body.requestId)&&(body.coupon==='clothing'||body.coupon==='goods')&&(body.gameWeek===undefined||(Number.isInteger(body.gameWeek)&&Number(body.gameWeek)>=1))&&Object.keys(body).every(k=>['action','requestId','coupon','gameWeek'].includes(k));
 return body.action==='korund-claim-work' ? uuid(body.shiftId)&&(body.requestId===undefined||uuid(body.requestId)) : ['korund-start-work','korund-redeem-ration','korund-household-meal','korund-join-ration-queue'].includes(String(body.action)) && uuid(body.requestId);
}
async function week(db:GameDatabase,now:number) {
 const row=await db.prepare("SELECT epoch_seconds FROM world_clock WHERE id='main'").first<{epoch_seconds:number}>();
 // #205: before any write path has started the clock, read the epoch advanceWorld would record (tick-aligned now).
 const clock={epoch_seconds:row?Number(row.epoch_seconds):Math.floor(now/7200)*7200};
 const index=Math.floor(Math.max(0,now-clock.epoch_seconds)/gameWeekSeconds);
 const start=clock.epoch_seconds+index*gameWeekSeconds;
 return {number:index+1,start,end:start+gameWeekSeconds,expiresAt:new Date((start+gameWeekSeconds)*1000).toISOString()};
}
export async function readKorund(db:GameDatabase,userId:string,now:number,options:{laborBureau?:boolean}={}):Promise<KorundPlan> {
 const w=await week(db,now);
 const [citizen,ledger,shifts]=await Promise.all([
 db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{nation_id:string}>(),
 // Funds, public food, wallet, private food and food-coupon use share one read snapshot. Clothing/goods coupons and
 // the quota bar are read afterwards by readCouponsAndQuota (a separate round-trip; display only, never a guard).
 db.prepare(`SELECT initial_food+COALESCE((SELECT SUM(food_output) FROM korund_settlements),0)-COALESCE((SELECT SUM(quantity) FROM korund_rations),0) AS public_food,
 initial_minor-COALESCE((SELECT SUM(wage_minor) FROM korund_settlements),0) AS funds,
 COALESCE((SELECT SUM(wage_minor) FROM korund_settlements WHERE clerk_user_id=?),0)-COALESCE((SELECT SUM(price_minor) FROM korund_coupon_redemptions WHERE clerk_user_id=?),0) AS wallet,
 COALESCE((SELECT SUM(quantity) FROM korund_rations WHERE clerk_user_id=?),0)-COALESCE((SELECT SUM(quantity) FROM korund_meals WHERE clerk_user_id=?),0) AS food,
 EXISTS(SELECT 1 FROM korund_rations WHERE clerk_user_id=? AND game_week=?) AS coupon_used,
 (SELECT MAX(occurred_at) FROM korund_meals WHERE clerk_user_id=?) AS last_meal
 FROM korund_resources WHERE id='state'`).bind(userId,userId,userId,userId,userId,w.number,userId)
 .first<{public_food:number;funds:number;wallet:number;food:number;coupon_used:number;last_meal:number|null}>(),
 db.prepare(`SELECT s.* FROM work_shifts s JOIN korund_work_starts k ON k.id=s.id WHERE s.clerk_user_id=? ORDER BY s.started_at DESC LIMIT 20`).bind(userId).all<{id:string;order_name:string;output:string;capacity_spent:number;started_at:string;completes_at:string;claimed_at:string|null}>(),
 ]);
 const extra=await readCouponsAndQuota(db,userId,w.number,Boolean(ledger?.coupon_used),w.start,w.end);
 const bureau=options.laborBureau&&citizen?.nation_id==='korund'?{bureau:await readBureau(db,userId,now)}:{};
 return {...extra,...bureau,available:citizen?.nation_id==='korund',mode:'bounded state planning',assignment:korundJob,walletMinor:ledger?.wallet??0,foodQuantity:ledger?.food??0,
 publicFoodRemaining:ledger?.public_food??0,publicFundMinor:ledger?.funds??0,gameWeek:w.number,couponFoodRemaining:ledger?.coupon_used?0:2,couponExpiresAt:w.expiresAt,
 queue:citizen?.nation_id==='korund'?await readRationQueue(db,userId,w.number,now):{waiting:0,requestId:null,position:null},mealReadyAt:ledger?.last_meal==null?null:new Date((ledger.last_meal+7200)*1000).toISOString(),shifts:shifts.results.map(s=>({id:s.id,orderName:s.order_name,output:s.output,capacitySpent:s.capacity_spent,currency:'LN',wageMinor:800,rewardItem:'state food',rewardQuantity:4,startedAt:s.started_at,completesAt:s.completes_at,claimedAt:s.claimed_at}))};
}
export async function executeKorund(db:GameDatabase,userId:string,command:KorundCommand,now:number,options:{laborBureau?:boolean}={}) {
 const nation=await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{nation_id:string}>();
 // An already-started shift may settle into its original LN ledger after a grace-period move.
 if(nation?.nation_id!=='korund' && command.action!=='korund-claim-work') return {status:409,error:'Korund citizenship required; previous balances remain in their original currency.'};
 if(command.action==='korund-set-preferences'||command.action==='korund-request-assignment'){
  // #235: the Labor Bureau ships off; with the flag off these actions change nothing.
  if(!options.laborBureau)return {status:403,reason:'disabled',error:'The Labor Bureau is not open yet.'};
  return command.action==='korund-set-preferences'?setPreferences(db,userId,command.preferences,now,command.requestId!.toLowerCase()):requestAssignment(db,userId,command.requestId!.toLowerCase(),now);
 }
 const iso=new Date(now*1000).toISOString();
 const id=(command.action==='korund-claim-work'?command.shiftId!:command.requestId!).toLowerCase();
 if(command.action==='korund-join-ration-queue'||command.action==='korund-cancel-ration-queue'){const w=await week(db,now);return executeRationQueue(db,userId,command.action,id,command.queueId?.toLowerCase(),w.number,now,Date.parse(w.expiresAt)/1000);}
 if(command.action==='korund-redeem-coupon')return redeemCoupon(db,userId,id,command.coupon!,now,command.gameWeek);
 if(await queueIdentifierUsed(db,id))return {status:409,error:'Request identifier already used for a ration queue action.'};
 if(command.action==='korund-start-work') {
 const conflicting=await db.prepare('SELECT id FROM korund_rations WHERE id=? UNION ALL SELECT id FROM korund_meals WHERE id=?').bind(id,id).first();
 if(conflicting) return {status:409,error:'Request identifier already used for another action.'};
 const existing=await db.prepare('SELECT clerk_user_id,work_order_id FROM work_shifts WHERE id=?').bind(id).first<{clerk_user_id:string;work_order_id:string}>();
 if(existing) return existing.clerk_user_id===userId&&existing.work_order_id===korundJob.id?{status:200,replayed:true}:{status:409,error:'Work identifier already used.'};
 await db.batch([
 db.prepare(korundStartSql).bind(id,iso,new Date((now+7200)*1000).toISOString(),userId,userId,id,id,id,id),
 db.prepare(korundStartReceiptSql).bind(id,userId),db.prepare(korundDebitSql).bind(iso,userId,id),
 db.prepare('UPDATE korund_work_starts SET capacity_applied=1 WHERE id=? AND EXISTS(SELECT 1 FROM work_shifts WHERE id=? AND clerk_user_id=?)').bind(id,id,userId),
 ]);
 const started=await db.prepare('SELECT id FROM work_shifts WHERE id=? AND clerk_user_id=?').bind(id,userId).first();
 return started?{status:200}:{status:409,error:'Finish your active shift or check your Work Capacity before starting the assigned job.'};
 }
 if(command.action==='korund-claim-work') {
 const shiftId=command.shiftId!.toLowerCase();
 await db.batch([db.prepare(korundSettleSql).bind(now,shiftId,userId,iso),
 db.prepare('UPDATE work_shifts SET claimed_at=? WHERE id=? AND clerk_user_id=? AND claimed_at IS NULL AND EXISTS(SELECT 1 FROM korund_settlements WHERE shift_id=work_shifts.id AND clerk_user_id=?)').bind(iso,shiftId,userId,userId)]);
 const settled=await db.prepare('SELECT shift_id FROM korund_settlements WHERE shift_id=? AND clerk_user_id=?').bind(shiftId,userId).first();
 return settled?{status:200}:{status:409,error:'Assigned shift is unavailable, unfinished, or the finite Labor Note fund cannot pay it yet.'};
 }
 const table=command.action==='korund-redeem-ration'?'korund_rations':'korund_meals';
 // Table names are server constants, not user SQL.
 const existing=await db.prepare(`SELECT clerk_user_id FROM ${table} WHERE id=?`).bind(id).first<{clerk_user_id:string}>();
 const other=await db.prepare(`SELECT id FROM ${table==='korund_rations'?'korund_meals':'korund_rations'} WHERE id=? UNION ALL SELECT id FROM korund_work_starts WHERE id=?`).bind(id,id).first();
 if(other) return {status:409,error:'Request identifier already used for another action.'};
 if(existing) return existing.clerk_user_id===userId?{status:200,replayed:true}:{status:409,error:'Request identifier already used.'};
 if(command.action==='korund-redeem-ration') {
 const w=await week(db,now);await db.batch([db.prepare(korundRationSql).bind(id,w.number,now,userId,userId,w.number,id,id,id,id,w.number,now,w.number,now,userId,w.number,now),db.prepare("UPDATE korund_ration_queue SET status='redeemed' WHERE clerk_user_id=? AND game_week=? AND status='waiting' AND EXISTS(SELECT 1 FROM korund_rations WHERE id=? AND clerk_user_id=korund_ration_queue.clerk_user_id AND game_week=korund_ration_queue.game_week)").bind(userId,w.number,id)]);
 } else {
 await db.batch([db.prepare(korundMealSql).bind(id,now,userId,now,id,id,id,id),
 db.prepare('UPDATE citizens SET capacity=MIN(24,capacity+4),updated_at=? WHERE clerk_user_id=? AND EXISTS(SELECT 1 FROM korund_meals WHERE id=? AND clerk_user_id=? AND capacity_applied=0)').bind(iso,userId,id,userId),
 db.prepare('UPDATE korund_meals SET capacity_applied=1 WHERE id=? AND clerk_user_id=?').bind(id,userId)]);
 }
 const receipt=await db.prepare(`SELECT id FROM ${table} WHERE id=? AND clerk_user_id=?`).bind(id,userId).first();
 return receipt?{status:200}:{status:409,error:command.action==='korund-redeem-ration'?'Ration unavailable: this game-week coupon was used or public food is exhausted or an earlier FIFO request must collect first.':'Meal unavailable: check household food, Work Capacity and the two-hour meal timer.'};
}

async function redeemCoupon(db:GameDatabase,userId:string,id:string,coupon:'clothing'|'goods',now:number,shownWeek?:number){
 const existing=await db.prepare('SELECT clerk_user_id,coupon FROM korund_coupon_redemptions WHERE id=?').bind(id).first<{clerk_user_id:string;coupon:string}>();
 if(existing)return existing.clerk_user_id===userId&&existing.coupon===coupon?{status:200,replayed:true}:{status:409,error:'Request identifier already used.'};
 if(await queueIdentifierUsed(db,id)||await db.prepare('SELECT id FROM korund_rations WHERE id=? UNION ALL SELECT id FROM korund_meals WHERE id=? UNION ALL SELECT id FROM work_shifts WHERE id=?').bind(id,id,id).first())return {status:409,error:'Request identifier already used for another action.'};
 const w=await week(db,now);const good=korundCouponGoods[coupon];
 // The client sends the week it displayed; an expired book must never spend the new week's coupon.
 if(shownWeek!==undefined&&shownWeek!==w.number)return {status:409,error:'Your coupon book expired at the weekly reset. Refresh to see this week’s coupons.'};
 await db.prepare(korundCouponRedeemSql).bind(id,w.number,coupon,good.item,good.priceMinor,now,userId,userId,w.number,coupon,good.priceMinor,userId,userId).run();
 let receipt=await db.prepare('SELECT id FROM korund_coupon_redemptions WHERE id=? AND clerk_user_id=?').bind(id,userId).first();
 // Committed re-check (pattern from #47 ai-budget). Under Postgres READ COMMITTED, concurrent clothing and goods
 // redemptions can each pass the INSERT guard against the pre-insert balance. After commit, the later re-check
 // of any racing pair sees both rows, so a negative LN balance is always detected and this row is withdrawn.
 // Ties fail closed (both withdraw); no goods were handed out before this check.
 if(receipt&&await korundLaborNoteBalance(db,userId)<0){
  await db.prepare('DELETE FROM korund_coupon_redemptions WHERE id=? AND clerk_user_id=?').bind(id,userId).run();
  receipt=null;
 }
 return receipt?{status:200}:{status:409,error:`${good.label} unavailable: it was already used this game week or you need ${(good.priceMinor/100).toFixed(2)} LN.`};
}

export async function korundLaborNoteBalance(db:GameDatabase,userId:string){
 const row=await db.prepare('SELECT COALESCE((SELECT SUM(wage_minor) FROM korund_settlements WHERE clerk_user_id=?),0)-COALESCE((SELECT SUM(price_minor) FROM korund_coupon_redemptions WHERE clerk_user_id=?),0) AS balance').bind(userId,userId).first<{balance:number}>();
 return Number(row?.balance??0);
}
