import type {GameDatabase} from './database-contract';
import type { WorkShift } from './work-shifts';
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
 AND NOT EXISTS(SELECT 1 FROM korund_rations WHERE id=?) AND NOT EXISTS(SELECT 1 FROM korund_meals WHERE id=?)`;
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
 AND NOT EXISTS(SELECT 1 FROM korund_meals WHERE id=?) AND NOT EXISTS(SELECT 1 FROM korund_work_starts WHERE id=?)`;
export const korundMealSql = `INSERT OR IGNORE INTO korund_meals(id,clerk_user_id,quantity,occurred_at)
 SELECT ?,clerk_user_id,2,? FROM citizens WHERE clerk_user_id=? AND nation_id='korund' AND capacity<24
 AND 2<=COALESCE((SELECT SUM(quantity) FROM korund_rations WHERE clerk_user_id=citizens.clerk_user_id),0)-COALESCE((SELECT SUM(quantity) FROM korund_meals WHERE clerk_user_id=citizens.clerk_user_id),0)
 AND NOT EXISTS(SELECT 1 FROM korund_meals WHERE clerk_user_id=citizens.clerk_user_id AND occurred_at>?-7200)
 AND NOT EXISTS(SELECT 1 FROM korund_rations WHERE id=?) AND NOT EXISTS(SELECT 1 FROM korund_work_starts WHERE id=?)`;
export type KorundPlan = { available:boolean; mode:'bounded state planning'; assignment:typeof korundJob;
 walletMinor:number;foodQuantity:number;publicFoodRemaining:number;publicFundMinor:number;
 gameWeek:number;couponFoodRemaining:number;couponExpiresAt:string;mealReadyAt:string|null;shifts:WorkShift[] };
export type KorundCommand = {action:'korund-start-work'|'korund-claim-work'|'korund-redeem-ration'|'korund-household-meal'; requestId?:string;shiftId?:string};
const uuid=(v:unknown):v is string=>typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export function validKorundCommand(body:Record<string,unknown>):body is Record<string,unknown>&KorundCommand {
 return body.action==='korund-claim-work' ? uuid(body.shiftId) : ['korund-start-work','korund-redeem-ration','korund-household-meal'].includes(String(body.action)) && uuid(body.requestId);
}
async function week(db:GameDatabase,now:number) {
 const clock=await db.prepare("SELECT epoch_seconds FROM world_clock WHERE id='main'").first<{epoch_seconds:number}>();
 if(!clock) throw new Error('World clock unavailable.');
 const index=Math.floor(Math.max(0,now-clock.epoch_seconds)/gameWeekSeconds);
 return {number:index+1,expiresAt:new Date((clock.epoch_seconds+(index+1)*gameWeekSeconds)*1000).toISOString()};
}
export async function readKorund(db:GameDatabase,userId:string,now:number):Promise<KorundPlan> {
 const w=await week(db,now);
 const [citizen,ledger,shifts]=await Promise.all([
 db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{nation_id:string}>(),
 // Funds, public food, wallet, private food and coupon use share one SQLite read snapshot.
 db.prepare(`SELECT initial_food+COALESCE((SELECT SUM(food_output) FROM korund_settlements),0)-COALESCE((SELECT SUM(quantity) FROM korund_rations),0) AS public_food,
 initial_minor-COALESCE((SELECT SUM(wage_minor) FROM korund_settlements),0) AS funds,
 COALESCE((SELECT SUM(wage_minor) FROM korund_settlements WHERE clerk_user_id=?),0) AS wallet,
 COALESCE((SELECT SUM(quantity) FROM korund_rations WHERE clerk_user_id=?),0)-COALESCE((SELECT SUM(quantity) FROM korund_meals WHERE clerk_user_id=?),0) AS food,
 EXISTS(SELECT 1 FROM korund_rations WHERE clerk_user_id=? AND game_week=?) AS coupon_used,
 (SELECT MAX(occurred_at) FROM korund_meals WHERE clerk_user_id=?) AS last_meal
 FROM korund_resources WHERE id='state'`).bind(userId,userId,userId,userId,w.number,userId)
 .first<{public_food:number;funds:number;wallet:number;food:number;coupon_used:number;last_meal:number|null}>(),
 db.prepare(`SELECT s.* FROM work_shifts s JOIN korund_work_starts k ON k.id=s.id WHERE s.clerk_user_id=? ORDER BY s.started_at DESC LIMIT 20`).bind(userId).all<{id:string;order_name:string;output:string;capacity_spent:number;started_at:string;completes_at:string;claimed_at:string|null}>(),
 ]);
 return {available:citizen?.nation_id==='korund',mode:'bounded state planning',assignment:korundJob,walletMinor:ledger?.wallet??0,foodQuantity:ledger?.food??0,
 publicFoodRemaining:ledger?.public_food??0,publicFundMinor:ledger?.funds??0,gameWeek:w.number,couponFoodRemaining:ledger?.coupon_used?0:2,couponExpiresAt:w.expiresAt,
 mealReadyAt:ledger?.last_meal==null?null:new Date((ledger.last_meal+7200)*1000).toISOString(),shifts:shifts.results.map(s=>({id:s.id,orderName:s.order_name,output:s.output,capacitySpent:s.capacity_spent,currency:'LN',wageMinor:800,rewardItem:'state food',rewardQuantity:4,startedAt:s.started_at,completesAt:s.completes_at,claimedAt:s.claimed_at}))};
}
export async function executeKorund(db:GameDatabase,userId:string,command:KorundCommand,now:number) {
 const nation=await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{nation_id:string}>();
 // An already-started shift may settle into its original LN ledger after a grace-period move.
 if(nation?.nation_id!=='korund' && command.action!=='korund-claim-work') return {status:409,error:'Korund citizenship required; previous balances remain in their original currency.'};
 const iso=new Date(now*1000).toISOString();
 const id=(command.requestId??command.shiftId??'').toLowerCase();
 if(command.action==='korund-start-work') {
 const conflicting=await db.prepare('SELECT id FROM korund_rations WHERE id=? UNION ALL SELECT id FROM korund_meals WHERE id=?').bind(id,id).first();
 if(conflicting) return {status:409,error:'Request identifier already used for another action.'};
 const existing=await db.prepare('SELECT clerk_user_id,work_order_id FROM work_shifts WHERE id=?').bind(id).first<{clerk_user_id:string;work_order_id:string}>();
 if(existing) return existing.clerk_user_id===userId&&existing.work_order_id===korundJob.id?{status:200,replayed:true}:{status:409,error:'Work identifier already used.'};
 await db.batch([
 db.prepare(korundStartSql).bind(id,iso,new Date((now+7200)*1000).toISOString(),userId,userId,id,id),
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
 const w=await week(db,now);await db.prepare(korundRationSql).bind(id,w.number,now,userId,userId,w.number,id,id).run();
 } else {
 await db.batch([db.prepare(korundMealSql).bind(id,now,userId,now,id,id),
 db.prepare('UPDATE citizens SET capacity=MIN(24,capacity+4),updated_at=? WHERE clerk_user_id=? AND EXISTS(SELECT 1 FROM korund_meals WHERE id=? AND clerk_user_id=? AND capacity_applied=0)').bind(iso,userId,id,userId),
 db.prepare('UPDATE korund_meals SET capacity_applied=1 WHERE id=? AND clerk_user_id=?').bind(id,userId)]);
 }
 const receipt=await db.prepare(`SELECT id FROM ${table} WHERE id=? AND clerk_user_id=?`).bind(id,userId).first();
 return receipt?{status:200}:{status:409,error:command.action==='korund-redeem-ration'?'Ration unavailable: this game-week coupon was used or public food is exhausted.':'Meal unavailable: check household food, Work Capacity and the two-hour meal timer.'};
}
