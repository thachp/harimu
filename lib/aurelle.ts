import type { WorkShift } from './work-shifts';
// Bounded prototype tuning; no gold backing, issuance, ranks or charter allocation model.
export const aurelleJob = {id:'aurelle-food-estate',name:'Chartered food-estate service',capacityCost:4,hours:2,wageMinor:800,foodOutput:4,favorReward:2} as const;
export const aurelleFoodPriceMinor=150;
export const aurelleMealFood=2;
export const aurelleMealCapacity=4;
export const aurelleMealSeconds=7200;
export const aurelleSchemas=[
 `CREATE TABLE aurelle_resources(id TEXT PRIMARY KEY,initial_food INTEGER NOT NULL CHECK(initial_food>=0),initial_minor INTEGER NOT NULL CHECK(initial_minor>=0))`,
 `CREATE TABLE aurelle_receipts(id TEXT PRIMARY KEY,clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id),action TEXT NOT NULL CHECK(action IN ('aurelle-start-work','aurelle-claim-work','aurelle-buy-food','aurelle-household-meal')),quantity INTEGER NOT NULL CHECK(quantity BETWEEN 0 AND 2),shift_id TEXT,occurred_at INTEGER NOT NULL,capacity_applied INTEGER NOT NULL DEFAULT 0 CHECK(capacity_applied IN (0,1)))`,
 `CREATE TABLE aurelle_settlements(shift_id TEXT PRIMARY KEY REFERENCES work_shifts(id),clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id),wage_minor INTEGER NOT NULL CHECK(wage_minor=800),food_output INTEGER NOT NULL CHECK(food_output=4),favor INTEGER NOT NULL CHECK(favor=2),settled_at INTEGER NOT NULL)`,
 `CREATE TABLE aurelle_purchases(id TEXT PRIMARY KEY REFERENCES aurelle_receipts(id),clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id),quantity INTEGER NOT NULL CHECK(quantity IN (1,2)),spend_minor INTEGER NOT NULL CHECK(spend_minor=quantity*150))`,
 `CREATE TABLE aurelle_meals(id TEXT PRIMARY KEY REFERENCES aurelle_receipts(id),clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id),quantity INTEGER NOT NULL CHECK(quantity=2),occurred_at INTEGER NOT NULL)`,
] as const;
const publicFood=`initial_food+COALESCE((SELECT SUM(food_output) FROM aurelle_settlements),0)-COALESCE((SELECT SUM(quantity) FROM aurelle_purchases),0)`;
const publicFunds=`initial_minor+COALESCE((SELECT SUM(spend_minor) FROM aurelle_purchases),0)-COALESCE((SELECT SUM(wage_minor) FROM aurelle_settlements),0)`;
const privateWallet=`COALESCE((SELECT SUM(wage_minor) FROM aurelle_settlements WHERE clerk_user_id=citizens.clerk_user_id),0)-COALESCE((SELECT SUM(spend_minor) FROM aurelle_purchases WHERE clerk_user_id=citizens.clerk_user_id),0)`;
const privateFood=`COALESCE((SELECT SUM(quantity) FROM aurelle_purchases WHERE clerk_user_id=citizens.clerk_user_id),0)-COALESCE((SELECT SUM(quantity) FROM aurelle_meals WHERE clerk_user_id=citizens.clerk_user_id),0)`;
// Every eligibility and request binding lives inside the transactional writes.
export const aurelleStartReceiptSql=`INSERT OR IGNORE INTO aurelle_receipts(id,clerk_user_id,action,quantity,occurred_at)
 SELECT ?,clerk_user_id,'aurelle-start-work',0,? FROM citizens WHERE clerk_user_id=? AND nation_id='aurelle' AND capacity>=4
 AND NOT EXISTS(SELECT 1 FROM work_shifts WHERE clerk_user_id=citizens.clerk_user_id AND claimed_at IS NULL)
 AND NOT EXISTS(SELECT 1 FROM work_shifts WHERE id=?) AND 800<=(SELECT ${publicFunds} FROM aurelle_resources WHERE id='estate')`;
export const aurelleStartSql=`INSERT OR IGNORE INTO work_shifts(id,clerk_user_id,work_order_id,order_name,output,capacity_spent,started_at,completes_at)
 SELECT id,clerk_user_id,'aurelle-food-estate','Chartered food-estate service','4 food contributed to charter estate supply',4,?,?
 FROM aurelle_receipts WHERE id=? AND clerk_user_id=? AND action='aurelle-start-work' AND quantity=0 AND capacity_applied=0`;
export const aurelleStartDebitSql=`UPDATE citizens SET capacity=capacity-4,updated_at=? WHERE clerk_user_id=? AND EXISTS(
 SELECT 1 FROM aurelle_receipts r JOIN work_shifts s ON s.id=r.id WHERE r.id=? AND r.clerk_user_id=citizens.clerk_user_id AND r.action='aurelle-start-work' AND r.capacity_applied=0 AND s.work_order_id='aurelle-food-estate')`;
export const aurelleClaimReceiptSql=`INSERT OR IGNORE INTO aurelle_receipts(id,clerk_user_id,action,quantity,shift_id,occurred_at)
 SELECT ?,s.clerk_user_id,'aurelle-claim-work',0,s.id,? FROM work_shifts s JOIN aurelle_receipts r ON r.id=s.id
 WHERE s.id=? AND s.clerk_user_id=? AND s.work_order_id='aurelle-food-estate' AND s.completes_at<=? AND r.capacity_applied=1 AND r.action='aurelle-start-work'
 AND NOT EXISTS(SELECT 1 FROM work_shifts WHERE id=?)
 AND (EXISTS(SELECT 1 FROM aurelle_settlements WHERE shift_id=s.id AND clerk_user_id=s.clerk_user_id)
 OR 800<=(SELECT ${publicFunds} FROM aurelle_resources WHERE id='estate'))`;
export const aurelleSettleSql=`INSERT OR IGNORE INTO aurelle_settlements(shift_id,clerk_user_id,wage_minor,food_output,favor,settled_at)
 SELECT s.id,s.clerk_user_id,800,4,2,? FROM work_shifts s JOIN aurelle_receipts r ON r.shift_id=s.id
 WHERE r.id=? AND r.clerk_user_id=? AND r.action='aurelle-claim-work' AND s.clerk_user_id=r.clerk_user_id AND s.claimed_at IS NULL
 AND 800<=(SELECT ${publicFunds} FROM aurelle_resources WHERE id='estate')`;
export const aurelleBuyReceiptSql=`INSERT OR IGNORE INTO aurelle_receipts(id,clerk_user_id,action,quantity,occurred_at)
 SELECT ?,clerk_user_id,'aurelle-buy-food',?,? FROM citizens WHERE clerk_user_id=? AND nation_id='aurelle'
 AND ? IN (1,2) AND ?*150<=${privateWallet}
 AND ?<=(SELECT ${publicFood} FROM aurelle_resources WHERE id='estate') AND NOT EXISTS(SELECT 1 FROM work_shifts WHERE id=?)`;
export const aurelleBuySql=`INSERT OR IGNORE INTO aurelle_purchases(id,clerk_user_id,quantity,spend_minor)
 SELECT id,clerk_user_id,quantity,quantity*150 FROM aurelle_receipts WHERE id=? AND clerk_user_id=? AND action='aurelle-buy-food' AND quantity=?`;
export const aurelleMealReceiptSql=`INSERT OR IGNORE INTO aurelle_receipts(id,clerk_user_id,action,quantity,occurred_at)
 SELECT ?,clerk_user_id,'aurelle-household-meal',2,? FROM citizens WHERE clerk_user_id=? AND nation_id='aurelle' AND capacity<24 AND 2<=${privateFood}
 AND NOT EXISTS(SELECT 1 FROM aurelle_meals WHERE clerk_user_id=citizens.clerk_user_id AND occurred_at>?-7200) AND NOT EXISTS(SELECT 1 FROM work_shifts WHERE id=?)`;
export const aurelleMealSql=`INSERT OR IGNORE INTO aurelle_meals(id,clerk_user_id,quantity,occurred_at)
 SELECT id,clerk_user_id,2,occurred_at FROM aurelle_receipts WHERE id=? AND clerk_user_id=? AND action='aurelle-household-meal' AND quantity=2`;
export const aurelleMealCapacitySql=`UPDATE citizens SET capacity=MIN(24,capacity+4),updated_at=? WHERE clerk_user_id=? AND EXISTS(
 SELECT 1 FROM aurelle_receipts r JOIN aurelle_meals m ON m.id=r.id WHERE r.id=? AND r.clerk_user_id=citizens.clerk_user_id AND r.action='aurelle-household-meal' AND r.capacity_applied=0)`;
export type AurellePlan={available:boolean;mode:'bounded charter economy';charter:{id:string;name:string;active:boolean};job:typeof aurelleJob;
 walletMinor:number;foodQuantity:number;favor:number;publicFoodRemaining:number;publicFundMinor:number;mealReadyAt:string|null;shifts:WorkShift[]};
export type AurelleCommand={action:'aurelle-start-work'|'aurelle-claim-work'|'aurelle-buy-food'|'aurelle-household-meal';requestId:string;shiftId?:string;quantity?:number};
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function validAurelleCommand(body:Record<string,unknown>):body is Record<string,unknown>&AurelleCommand {
 if(!uuid(body.requestId)) return false;
 if(body.action==='aurelle-claim-work') return uuid(body.shiftId)&&body.quantity===undefined;
 if(body.shiftId!==undefined) return false;
 if(body.action==='aurelle-buy-food') return body.quantity===1||body.quantity===2;
 return (body.action==='aurelle-start-work'||body.action==='aurelle-household-meal')&&body.quantity===undefined;
}
export async function readAurelle(db:D1Database,userId:string):Promise<AurellePlan>{
 const [citizen,ledger,shifts]=await Promise.all([
 db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{nation_id:string}>(),
 db.prepare(`SELECT ${publicFood} AS public_food,${publicFunds} AS funds,
 COALESCE((SELECT SUM(wage_minor) FROM aurelle_settlements WHERE clerk_user_id=?),0)-COALESCE((SELECT SUM(spend_minor) FROM aurelle_purchases WHERE clerk_user_id=?),0) AS wallet,
 COALESCE((SELECT SUM(quantity) FROM aurelle_purchases WHERE clerk_user_id=?),0)-COALESCE((SELECT SUM(quantity) FROM aurelle_meals WHERE clerk_user_id=?),0) AS food,
 MIN(100,COALESCE((SELECT SUM(favor) FROM aurelle_settlements WHERE clerk_user_id=?),0)) AS favor,
 (SELECT MAX(occurred_at) FROM aurelle_meals WHERE clerk_user_id=?) AS last_meal FROM aurelle_resources WHERE id='estate'`)
 .bind(userId,userId,userId,userId,userId,userId).first<{public_food:number;funds:number;wallet:number;food:number;favor:number;last_meal:number|null}>(),
 db.prepare("SELECT * FROM work_shifts WHERE clerk_user_id=? AND work_order_id='aurelle-food-estate' ORDER BY started_at DESC LIMIT 20").bind(userId)
 .all<{id:string;order_name:string;output:string;capacity_spent:number;started_at:string;completes_at:string;claimed_at:string|null}>(),
 ]);
 return {available:citizen?.nation_id==='aurelle',mode:'bounded charter economy',charter:{id:'food-estate',name:'Highspire food-estate charter',active:true},job:aurelleJob,
 walletMinor:ledger?.wallet??0,foodQuantity:ledger?.food??0,favor:ledger?.favor??0,publicFoodRemaining:ledger?.public_food??0,publicFundMinor:ledger?.funds??0,
 mealReadyAt:ledger?.last_meal==null?null:new Date((ledger.last_meal+7200)*1000).toISOString(),
 shifts:shifts.results.map(s=>({id:s.id,orderName:s.order_name,output:s.output,capacitySpent:s.capacity_spent,currency:'CRN',wageMinor:800,rewardItem:'estate food',rewardQuantity:4,startedAt:s.started_at,completesAt:s.completes_at,claimedAt:s.claimed_at}))};
}
export async function executeAurelle(db:D1Database,userId:string,command:AurelleCommand,now:number){
 const id=command.requestId.toLowerCase(),shiftId=command.shiftId?.toLowerCase()??null;
 const quantity=command.action==='aurelle-buy-food'?command.quantity!:command.action==='aurelle-household-meal'?2:0;
 const receipt=()=>db.prepare('SELECT clerk_user_id,action,quantity,shift_id FROM aurelle_receipts WHERE id=?').bind(id).first<{clerk_user_id:string;action:string;quantity:number;shift_id:string|null}>();
 const matches=(row:Awaited<ReturnType<typeof receipt>>)=>row?.clerk_user_id===userId&&row.action===command.action&&row.quantity===quantity&&row.shift_id===(command.action==='aurelle-claim-work'?shiftId:null);
 const existing=await receipt();
 if(existing) return matches(existing)?{status:200,replayed:true}:{status:409,error:'Request identifier is bound to a different account, action or quantity.'};
 const citizen=await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{nation_id:string}>();
 if(citizen?.nation_id!=='aurelle'&&command.action!=='aurelle-claim-work') return {status:409,error:'Aurelle citizenship required. Original balances remain in their own currency.'};
 const iso=new Date(now*1000).toISOString();
 if(command.action==='aurelle-start-work') await db.batch([
 db.prepare(aurelleStartReceiptSql).bind(id,now,userId,id),db.prepare(aurelleStartSql).bind(iso,new Date((now+7200)*1000).toISOString(),id,userId),
 db.prepare(aurelleStartDebitSql).bind(iso,userId,id),
 db.prepare("UPDATE aurelle_receipts SET capacity_applied=1 WHERE id=? AND clerk_user_id=? AND action='aurelle-start-work' AND EXISTS(SELECT 1 FROM work_shifts WHERE id=? AND clerk_user_id=?)").bind(id,userId,id,userId),
 ]);
 else if(command.action==='aurelle-claim-work') await db.batch([
 db.prepare(aurelleClaimReceiptSql).bind(id,now,shiftId,userId,iso,id),db.prepare(aurelleSettleSql).bind(now,id,userId),
 db.prepare("UPDATE work_shifts SET claimed_at=? WHERE id=? AND clerk_user_id=? AND claimed_at IS NULL AND EXISTS(SELECT 1 FROM aurelle_receipts WHERE id=? AND clerk_user_id=? AND action='aurelle-claim-work' AND shift_id=work_shifts.id) AND EXISTS(SELECT 1 FROM aurelle_settlements WHERE shift_id=work_shifts.id AND clerk_user_id=?)").bind(iso,shiftId,userId,id,userId,userId),
 ]);
 else if(command.action==='aurelle-buy-food') await db.batch([
 db.prepare(aurelleBuyReceiptSql).bind(id,quantity,now,userId,quantity,quantity,quantity,id),db.prepare(aurelleBuySql).bind(id,userId,quantity),
 ]);
 else await db.batch([
 db.prepare(aurelleMealReceiptSql).bind(id,now,userId,now,id),db.prepare(aurelleMealSql).bind(id,userId),db.prepare(aurelleMealCapacitySql).bind(iso,userId,id),
 db.prepare("UPDATE aurelle_receipts SET capacity_applied=1 WHERE id=? AND clerk_user_id=? AND action='aurelle-household-meal'").bind(id,userId),
 ]);
 const recorded=await receipt();
 if(recorded&&!matches(recorded))return {status:409,error:'Request identifier is bound to a different account, action or quantity.'};
 return recorded?{status:200}:{status:409,error:'Charter action unavailable. Check citizenship, active shift, completion time, capacity, estate funds, food and meal cooldown.'};
}
