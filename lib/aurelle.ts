import type {GameDatabase} from './database-contract';
import type { WorkShift } from './work-shifts';
import type { CrownMint } from './crown-debasement'; // #362 (type only: tests/aurelle.test.py loads this file straight into Node, so it needs no runtime import of a module)
import { farmingShiftYield, leadingFoodUnits, seasonAt, storedFoodUnits } from './season-yield.ts'; // #1033
import { refuseNewShift } from './shift-soft-cap.ts'; // #1047
// Bounded prototype tuning; no gold backing, issuance, ranks or charter allocation model.
export const aurelleJob = {id:'aurelle-food-estate',name:'Chartered food-estate service',capacityCost:4,hours:2,wageMinor:800,foodOutput:4,favorReward:2} as const;
export const aurelleFoodPriceMinor=150;
export const aurelleMealFood=2;
export const aurelleMealCapacity=4;
export const aurelleMealSeconds=7200;
/** #886 (c): ARC ruling on #886: Aurelle gets two charter jobs (quarrying, foundry) paid in Crowns from the estate treasury (aurelle_resources 'estate'),
 *  and every payment writes one Crown issuance record (crown_issuances), the ledger #885's Crown cap will read. Behind HARIMU_MVP_JOB_TYPES_ENABLED: with the flag on,
 *  aurelle-start-work may name one of these as `jobId`; without it (or with the flag off) the food-estate service runs exactly as before. Migration 0091;
 *  #957 (migration 0104) widens crown_issuances so food-estate wages mint rows too (FK → work_shifts; source aurelle-food-estate-wage).
 *  [ASSUMPTION] (ARC: copy the existing shift values): 4 WC, 2 hours, 800 CRN, like aurelleJob; no estate food and no Royal Favor (those stay with the food estate). */
export const aurelleCharterJobs={
 'aurelle-quarry-charter':{name:'Chartered quarry service',output:'Stone cut under the Highspire quarry charter'},
 'aurelle-foundry-charter':{name:'Chartered foundry service',output:'Castings poured under the royal foundry charter'},
} as const;
export const aurelleCharterTerms={capacityCost:4,hours:2,wageMinor:800} as const;
export const isAurelleCharter=(id:unknown):id is keyof typeof aurelleCharterJobs=>typeof id==='string'&&Object.hasOwn(aurelleCharterJobs,id);
const charterList=Object.keys(aurelleCharterJobs).map(id=>`'${id}'`).join(','); // code constants, never user input
export const aurelleSchemas=[
 `CREATE TABLE aurelle_resources(id TEXT PRIMARY KEY,initial_food INTEGER NOT NULL CHECK(initial_food>=0),initial_minor INTEGER NOT NULL CHECK(initial_minor>=0))`,
 `CREATE TABLE aurelle_receipts(id TEXT PRIMARY KEY,clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id),action TEXT NOT NULL CHECK(action IN ('aurelle-start-work','aurelle-claim-work','aurelle-buy-food','aurelle-household-meal')),quantity INTEGER NOT NULL CHECK(quantity BETWEEN 0 AND 2),shift_id TEXT,occurred_at INTEGER NOT NULL,capacity_applied INTEGER NOT NULL DEFAULT 0 CHECK(capacity_applied IN (0,1)))`,
 `CREATE TABLE aurelle_settlements(shift_id TEXT PRIMARY KEY REFERENCES work_shifts(id),clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id),wage_minor INTEGER NOT NULL CHECK(wage_minor=800),food_output INTEGER NOT NULL CHECK(food_output>=1),favor INTEGER NOT NULL CHECK(favor=2),settled_at INTEGER NOT NULL)`,
 `CREATE TABLE aurelle_purchases(id TEXT PRIMARY KEY REFERENCES aurelle_receipts(id),clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id),quantity INTEGER NOT NULL CHECK(quantity IN (1,2)),spend_minor INTEGER NOT NULL CHECK(spend_minor=quantity*150))`,
 `CREATE TABLE aurelle_charter_settlements(shift_id TEXT PRIMARY KEY REFERENCES work_shifts(id),clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id),job_id TEXT NOT NULL,wage_minor INTEGER NOT NULL CHECK(wage_minor>0),settled_at INTEGER NOT NULL)`,
 `CREATE TABLE crown_issuances(id TEXT PRIMARY KEY,shift_id TEXT NOT NULL UNIQUE REFERENCES work_shifts(id),clerk_user_id TEXT NOT NULL,amount_minor INTEGER NOT NULL CHECK(amount_minor>0),source TEXT NOT NULL CHECK(source IN ('aurelle-charter-wage','aurelle-food-estate-wage')),issued_at INTEGER NOT NULL)`,
 `CREATE TABLE aurelle_meals(id TEXT PRIMARY KEY REFERENCES aurelle_receipts(id),clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id),quantity INTEGER NOT NULL CHECK(quantity=2),occurred_at INTEGER NOT NULL)`,
] as const;
/** #289: Royal Favor is spent here (docs 14.2 / daily loops: "spent on petitions, ranks, estates, pardons"; leaving the Kinward Rite costs Royal Favor).
 * Each spend is one immutable row keyed by its request id, so a retry can never debit twice. Balance = min(100, earned) - spent, never below 0. */
export const royalFavorSchemas=[
 `CREATE TABLE IF NOT EXISTS aurelle_favor_spends(request_id TEXT PRIMARY KEY,clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,amount INTEGER NOT NULL CHECK(amount>0),reason TEXT NOT NULL CHECK(reason IN ('leave-kinward','charter-grant','charter-renew')),spent_at INTEGER NOT NULL)`,
] as const;
/** #529 and #585: the one Royal Favor rule. Favor is earned at settlement (aurelle_settlements.favor), capped at 100, and spent (aurelle_favor_spends); no balance is stored.
 *  With the decay flag off (decayAt undefined) the rule is exactly the pre-#529 one. With HARIMU_FAVOR_DECAY_ENABLED on, decayAt is the current time in seconds and each
 *  settled Favor point fades linearly to nothing over favorDecaySeconds (ARC accepted 14 real days on #567). All of it is scaled by the window W so there is one truncation:
 *  earned = SUM(favor x max(0, W - age)); a spend counts only against Favor earned before it (ARC on #585: earn 20, spend 10, wait 14 days, earn 10 reads 10, not 0), so each
 *  spend is charged MIN(amount x W, the faded Favor earned at or before its spent_at); balance = trunc(max(0, min(100 x W, earned) - charged) / W). Read-time only: no cron, no write.
 *  A spend still can never take the balance below zero. Fresh spends (made while their Favor has not faded) cost their full amount, exactly as the flat rule. */
export const favorCap=100;
export const favorDecaySeconds=14*86400;
const fadedFavor=(table:string)=>`SUM(${table}favor*(CASE WHEN ${table}settled_at>? THEN MIN(${table}settled_at,?)-? ELSE 0 END))`; // binds: cutoff, decayAt, cutoff
const favorSpentFlat=(user:string)=>`COALESCE((SELECT SUM(amount) FROM aurelle_favor_spends WHERE clerk_user_id=${user}),0)`;
const favorEarnedFlat=(user:string)=>`COALESCE((SELECT SUM(favor) FROM aurelle_settlements WHERE clerk_user_id=${user}),0)`;
const favorEarnedDecayed=(user:string)=>`COALESCE((SELECT ${fadedFavor('')} FROM aurelle_settlements WHERE clerk_user_id=${user}),0)`;
const favorChargedDecayed=(user:string)=>`COALESCE((SELECT SUM(MIN(s.amount*${favorDecaySeconds},COALESCE((SELECT ${fadedFavor('r.')} FROM aurelle_settlements r WHERE r.clerk_user_id=s.clerk_user_id AND r.settled_at<=s.spent_at),0))) FROM aurelle_favor_spends s WHERE s.clerk_user_id=${user}),0)`;
/** SQL for the spendable Favor of one citizen and its binds, in order (see royalFavorBinds). `user` is `?` (the default) or a column of an outer query (then no user bind). */
export const royalFavorSql=(decayAt?:number,user='?')=>decayAt===undefined?`MAX(0,MIN(${favorCap},${favorEarnedFlat(user)})-${favorSpentFlat(user)})`:`CAST(MAX(0,MIN(${favorCap*favorDecaySeconds},${favorEarnedDecayed(user)})-${favorChargedDecayed(user)})/${favorDecaySeconds} AS INTEGER)`;
const fadeBinds=(decayAt:number)=>[decayAt-favorDecaySeconds,decayAt,decayAt-favorDecaySeconds];
export const royalFavorBinds=(userId:string,decayAt?:number):unknown[]=>decayAt===undefined?[userId,userId]:[...fadeBinds(decayAt),userId,...fadeBinds(decayAt),userId];
/** The binds of royalFavorSql(decayAt, column): the two fade windows and no user. */
export const royalFavorColumnBinds=(decayAt:number):unknown[]=>[...fadeBinds(decayAt),...fadeBinds(decayAt)];
/** #585/#616: the average Royal Favor over settling citizens, each citizen's balance by the rule above (read by the Aurelle coup while HARIMU_FAVOR_DECAY_ENABLED is on; binds: royalFavorColumnBinds). */
export const royalFavorAverageSql=(decayAt:number)=>`SELECT AVG(f) AS favor FROM (SELECT ${royalFavorSql(decayAt,'u.clerk_user_id')} AS f FROM (SELECT DISTINCT clerk_user_id FROM aurelle_settlements) u) t`;
/** #616: the decayed balance reads one citizen's settlements and spends by clerk_user_id (the spend charge also by settled_at <= spent_at), once per settling citizen. Without these the coup average scans both tables
 *  for every citizen (quadratic: 12 s at 3,000 citizens). Covering, so the sums never touch the table rows. The same statements are in migration 0051 (drizzle and db/postgres). */
export const aurelleFavorIndexes=[
 'CREATE INDEX IF NOT EXISTS idx_aurelle_settlements_user_settled ON aurelle_settlements(clerk_user_id, settled_at, favor)',
 'CREATE INDEX IF NOT EXISTS idx_aurelle_favor_spends_user_spent ON aurelle_favor_spends(clerk_user_id, spent_at, amount)',
] as const;
/** Flag off: the SQL the balance has always used (the first `?` twice: earned, spent). Kept as a constant for the guarded leave-kinward spend. */
export const royalFavorBalanceSql=royalFavorSql();
/** Spendable Royal Favor; decayAt (seconds) applies the #529 decay. A database without migration 0028 yet has nothing spent, but nothing can be spent either (see faith.ts). */
export async function royalFavorBalance(db:GameDatabase,userId:string,decayAt?:number):Promise<number>{
 try{const row=await db.prepare(`SELECT ${royalFavorSql(decayAt)} AS favor`).bind(...royalFavorBinds(userId,decayAt)).first<{favor:number}>();return Number(row?.favor??0);}
 catch(error){if(!/no such table|does not exist|42P01/i.test(String((error as {code?:string})?.code??'')+' '+String((error as Error)?.message??error)))throw error;/* only a missing aurelle_favor_spends falls back: any other failure must not read as a balance (inline: tests/aurelle.test.py loads this file without a resolver, so no ./db-errors import) */const row=decayAt===undefined?await db.prepare('SELECT MIN(100,COALESCE(SUM(favor),0)) AS favor FROM aurelle_settlements WHERE clerk_user_id=?').bind(userId).first<{favor:number}>():await db.prepare(`SELECT CAST(MIN(${favorCap*favorDecaySeconds},${favorEarnedDecayed('?')})/${favorDecaySeconds} AS INTEGER) AS favor`).bind(...fadeBinds(decayAt),userId).first<{favor:number}>();return Number(row?.favor??0);}
}
const publicFood=`initial_food+COALESCE((SELECT SUM(food_output) FROM aurelle_settlements),0)-COALESCE((SELECT SUM(quantity) FROM aurelle_purchases),0)`;
const publicFunds=`initial_minor+COALESCE((SELECT SUM(spend_minor) FROM aurelle_purchases),0)-COALESCE((SELECT SUM(wage_minor) FROM aurelle_settlements),0)-COALESCE((SELECT SUM(wage_minor) FROM aurelle_charter_settlements),0)`;
const privateWallet=`COALESCE((SELECT SUM(wage_minor) FROM aurelle_settlements WHERE clerk_user_id=citizens.clerk_user_id),0)+COALESCE((SELECT SUM(wage_minor) FROM aurelle_charter_settlements WHERE clerk_user_id=citizens.clerk_user_id),0)-COALESCE((SELECT SUM(spend_minor) FROM aurelle_purchases WHERE clerk_user_id=citizens.clerk_user_id),0)`;
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
/** #906: first statement of the pool-paid claim batch: row-locks the estate treasury so concurrent claims on Postgres queue here (see lib/korund korundPoolLockSql). */
export const aurellePoolLockSql="UPDATE aurelle_resources SET initial_minor=initial_minor WHERE id='estate'";
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
// #886 (c) charter-job SQL. Start reuses aurelleStartReceiptSql (citizen, WC, no active shift, the treasury can cover a wage); these replace only the order-specific steps.
/** Bind (jobId, name, output): the charter's work order, written lazily (closed, so it never shows on the open work board). */
export const aurelleCharterOrderSql=`INSERT OR IGNORE INTO work_orders (id,nation_id,name,detail,capacity_cost,status,sort_order) VALUES (?,'aurelle',?,?,${aurelleCharterTerms.capacityCost},'closed',1000)`;
/** Bind (jobId, name, output, startedIso, completesIso, id, userId). */
export const aurelleCharterStartSql=`INSERT OR IGNORE INTO work_shifts(id,clerk_user_id,work_order_id,order_name,output,capacity_spent,started_at,completes_at)
 SELECT id,clerk_user_id,?,?,?,${aurelleCharterTerms.capacityCost},?,? FROM aurelle_receipts WHERE id=? AND clerk_user_id=? AND action='aurelle-start-work' AND quantity=0 AND capacity_applied=0`;
/** Bind (iso, userId, id). */
export const aurelleCharterDebitSql=`UPDATE citizens SET capacity=capacity-${aurelleCharterTerms.capacityCost},updated_at=? WHERE clerk_user_id=? AND EXISTS(
 SELECT 1 FROM aurelle_receipts r JOIN work_shifts s ON s.id=r.id WHERE r.id=? AND r.clerk_user_id=citizens.clerk_user_id AND r.action='aurelle-start-work' AND r.capacity_applied=0 AND s.work_order_id IN (${charterList}))`;
/** Bind (id, now, shiftId, userId, iso, id): same shape as aurelleClaimReceiptSql for a charter shift. */
export const aurelleCharterClaimReceiptSql=`INSERT OR IGNORE INTO aurelle_receipts(id,clerk_user_id,action,quantity,shift_id,occurred_at)
 SELECT ?,s.clerk_user_id,'aurelle-claim-work',0,s.id,? FROM work_shifts s JOIN aurelle_receipts r ON r.id=s.id
 WHERE s.id=? AND s.clerk_user_id=? AND s.work_order_id IN (${charterList}) AND s.completes_at<=? AND r.capacity_applied=1 AND r.action='aurelle-start-work'
 AND NOT EXISTS(SELECT 1 FROM work_shifts WHERE id=?) AND ${aurelleCharterTerms.wageMinor}<=(SELECT ${publicFunds} FROM aurelle_resources WHERE id='estate')`;
/** Bind (now, receiptId, userId). Pays only while the treasury can cover it. */
export const aurelleCharterSettleSql=`INSERT OR IGNORE INTO aurelle_charter_settlements(shift_id,clerk_user_id,job_id,wage_minor,settled_at)
 SELECT s.id,s.clerk_user_id,s.work_order_id,${aurelleCharterTerms.wageMinor},? FROM work_shifts s JOIN aurelle_receipts r ON r.shift_id=s.id
 WHERE r.id=? AND r.clerk_user_id=? AND r.action='aurelle-claim-work' AND s.clerk_user_id=r.clerk_user_id AND s.claimed_at IS NULL AND s.work_order_id IN (${charterList})
 AND ${aurelleCharterTerms.wageMinor}<=(SELECT ${publicFunds} FROM aurelle_resources WHERE id='estate')`;
/** Bind (shiftId): one Crown issuance record per charter payment, same batch as the settlement; nothing when it did not land. */
export const crownIssuanceSql=`INSERT OR IGNORE INTO crown_issuances(id,shift_id,clerk_user_id,amount_minor,source,issued_at)
 SELECT 'crn-wage:'||shift_id,shift_id,clerk_user_id,wage_minor,'aurelle-charter-wage',settled_at FROM aurelle_charter_settlements WHERE shift_id=?`;
/** Bind (shiftId): #957 food-estate wage issuance from aurelle_settlements (always written when the settle lands; cap enforcement stays flag-gated). */
export const crownFoodEstateIssuanceSql=`INSERT OR IGNORE INTO crown_issuances(id,shift_id,clerk_user_id,amount_minor,source,issued_at)
 SELECT 'crn-wage:'||shift_id,shift_id,clerk_user_id,wage_minor,'aurelle-food-estate-wage',settled_at FROM aurelle_settlements WHERE shift_id=?`;
/** Bind (yearStart, yearEnd, gameYear) after aurelleCharterSettleSql / aurelleSettleSql's three binds. #885/#957: refuse when this wage plus Crown issuances and debasement contributions in the game year would pass the yearly Charter Limit. */
export const crownYearCapSql=` AND ${aurelleCharterTerms.wageMinor}+COALESCE((SELECT SUM(amount_minor) FROM crown_issuances WHERE issued_at>=? AND issued_at<?),0)+COALESCE((SELECT SUM((percent_bp*(SELECT initial_minor FROM aurelle_resources WHERE id='estate'))/10000) FROM crown_decrees WHERE game_year=?),0)<=(SELECT (initial_minor*3000)/10000 FROM aurelle_resources WHERE id='estate')`;
export type AurellePlan={available:boolean;mode:'bounded charter economy';charter:{id:string;name:string;active:boolean};job:typeof aurelleJob;
 walletMinor:number;foodQuantity:number;favor:number;publicFoodRemaining:number;publicFundMinor:number;mealReadyAt:string|null;shifts:WorkShift[];
 /** #362: read-only mint parity, Currency Confidence and official rate strip; present only while HARIMU_CROWN_DEBASEMENT_ENABLED is on. */
 mint?:CrownMint};
export type AurelleCommand={action:'aurelle-start-work'|'aurelle-claim-work'|'aurelle-buy-food'|'aurelle-household-meal';requestId:string;shiftId?:string;quantity?:number;jobId?:string};
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function validAurelleCommand(body:Record<string,unknown>):body is Record<string,unknown>&AurelleCommand {
 if(!uuid(body.requestId)) return false;
 if(body.action==='aurelle-claim-work') return uuid(body.shiftId)&&body.quantity===undefined;
 if(body.shiftId!==undefined) return false;
 if(body.action==='aurelle-buy-food') return body.quantity===1||body.quantity===2;
 return (body.action==='aurelle-start-work'||body.action==='aurelle-household-meal')&&body.quantity===undefined;
}
export async function readAurelle(db:GameDatabase,userId:string,options:{favorDecayAt?:number;mealSeconds?:number}={}):Promise<AurellePlan>{
 const [citizen,ledger,shifts,favor]=await Promise.all([
 db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{nation_id:string}>(),
 db.prepare(`SELECT ${publicFood} AS public_food,${publicFunds} AS funds,
 COALESCE((SELECT SUM(wage_minor) FROM aurelle_settlements WHERE clerk_user_id=?),0)+COALESCE((SELECT SUM(wage_minor) FROM aurelle_charter_settlements WHERE clerk_user_id=?),0)-COALESCE((SELECT SUM(spend_minor) FROM aurelle_purchases WHERE clerk_user_id=?),0) AS wallet,
 COALESCE((SELECT SUM(quantity) FROM aurelle_purchases WHERE clerk_user_id=?),0)-COALESCE((SELECT SUM(quantity) FROM aurelle_meals WHERE clerk_user_id=?),0) AS food,
 (SELECT MAX(occurred_at) FROM aurelle_meals WHERE clerk_user_id=?) AS last_meal FROM aurelle_resources WHERE id='estate'`)
 .bind(userId,userId,userId,userId,userId,userId).first<{public_food:number;funds:number;wallet:number;food:number;last_meal:number|null}>(),
 db.prepare(`SELECT * FROM work_shifts WHERE clerk_user_id=? AND work_order_id IN ('aurelle-food-estate',${charterList}) ORDER BY started_at DESC LIMIT 20`).bind(userId)
 .all<{id:string;work_order_id:string;order_name:string;output:string;capacity_spent:number;started_at:string;completes_at:string;claimed_at:string|null}>(),
 royalFavorBalance(db,userId,options.favorDecayAt), // #289, #529: the one Favor rule (earned, capped at 100, decayed when the flag is on, minus spent)
 ]);
 return {available:citizen?.nation_id==='aurelle',mode:'bounded charter economy',charter:{id:'food-estate',name:'Highspire food-estate charter',active:true},job:aurelleJob,
 walletMinor:ledger?.wallet??0,foodQuantity:ledger?.food??0,favor:favor,publicFoodRemaining:ledger?.public_food??0,publicFundMinor:ledger?.funds??0,
 mealReadyAt:ledger?.last_meal==null?null:new Date((ledger.last_meal+(options.mealSeconds??aurelleMealSeconds))*1000).toISOString(),
 shifts:shifts.results.map(s=>({id:s.id,orderName:s.order_name,output:s.output,capacitySpent:s.capacity_spent,currency:'CRN',wageMinor:800,...(isAurelleCharter(s.work_order_id)?{}:{rewardItem:'estate food',rewardQuantity:leadingFoodUnits(s.output)}),startedAt:s.started_at,completesAt:s.completes_at,claimedAt:s.claimed_at}))};
}
/** #531: mealSeconds is the household-meal cooldown; only a chartered citizen (flag on) passes a shorter one. The SQL keeps its literal 7200, so the shorter window is a shifted reference time. */
export async function executeAurelle(db:GameDatabase,userId:string,command:AurelleCommand,now:number,mealSeconds:number=aurelleMealSeconds,options:{mvpJobTypes?:boolean;emissionCaps?:boolean;seasonFarming?:boolean;shiftSoftCap?:boolean}={}){
 const id=command.requestId.toLowerCase(),shiftId=command.shiftId?.toLowerCase()??null;
 const quantity=command.action==='aurelle-buy-food'?command.quantity!:command.action==='aurelle-household-meal'?2:0;
 const receipt=()=>db.prepare('SELECT clerk_user_id,action,quantity,shift_id FROM aurelle_receipts WHERE id=?').bind(id).first<{clerk_user_id:string;action:string;quantity:number;shift_id:string|null}>();
 const matches=(row:Awaited<ReturnType<typeof receipt>>)=>row?.clerk_user_id===userId&&row.action===command.action&&row.quantity===quantity&&row.shift_id===(command.action==='aurelle-claim-work'?shiftId:null);
 const existing=await receipt();
 if(existing) return matches(existing)?{status:200,replayed:true}:{status:409,error:'Request identifier is bound to a different account, action or quantity.'};
 const citizen=await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{nation_id:string}>();
 if(citizen?.nation_id!=='aurelle'&&command.action!=='aurelle-claim-work') return {status:409,error:'Aurelle citizenship required. Original balances remain in their own currency.'};
 if(command.action==='aurelle-start-work'&&options.shiftSoftCap){const blocked=await refuseNewShift(db,userId,now);if(blocked)return{status:409,error:blocked.error};}
 const iso=new Date(now*1000).toISOString();
 // #886 (c): flag on and a named charter job: start it; a charter shift's claim pays into aurelle_charter_settlements with its Crown issuance record (keyed on the shift, not the flag).
 const charter=command.action==='aurelle-start-work'&&options.mvpJobTypes&&isAurelleCharter(command.jobId)?command.jobId:null;
 const claimsCharter=command.action==='aurelle-claim-work'&&isAurelleCharter((await db.prepare('SELECT work_order_id FROM work_shifts WHERE id=? AND clerk_user_id=?').bind(shiftId,userId).first<{work_order_id:string}>())?.work_order_id);
 if(charter){const job=aurelleCharterJobs[charter];await db.batch([
 db.prepare(aurelleCharterOrderSql).bind(charter,job.name,job.output),
 db.prepare(aurelleStartReceiptSql).bind(id,now,userId,id),db.prepare(aurelleCharterStartSql).bind(charter,job.name,job.output,iso,new Date((now+aurelleCharterTerms.hours*3600)*1000).toISOString(),id,userId),
 db.prepare(aurelleCharterDebitSql).bind(iso,userId,id),
 db.prepare("UPDATE aurelle_receipts SET capacity_applied=1 WHERE id=? AND clerk_user_id=? AND action='aurelle-start-work' AND EXISTS(SELECT 1 FROM work_shifts WHERE id=? AND clerk_user_id=?)").bind(id,userId,id,userId),
 ]);}
 else if(claimsCharter){
  // #885: when emission caps are on, append the yearly Charter Limit guard to both the claim receipt and the settle (so a refused claim stays 409); flag off keeps the original binds byte-identical.
  let claimReceipt=db.prepare(aurelleCharterClaimReceiptSql).bind(id,now,shiftId,userId,iso,id);
  let charterSettle=db.prepare(aurelleCharterSettleSql).bind(now,id,userId);
  if(options.emissionCaps){
   const epoch=Number((await db.prepare("SELECT epoch_seconds FROM world_clock WHERE id='main'").first<{epoch_seconds:number}>())?.epoch_seconds??0);
   const yearSeconds=30*86400; // emissionCapsConfig.gameYearSeconds
   const year=Math.floor(Math.max(0,now-epoch)/yearSeconds)+1;
   const start=epoch+(year-1)*yearSeconds, end=start+yearSeconds;
   claimReceipt=db.prepare(aurelleCharterClaimReceiptSql+crownYearCapSql).bind(id,now,shiftId,userId,iso,id,start,end,year);
   charterSettle=db.prepare(aurelleCharterSettleSql+crownYearCapSql).bind(now,id,userId,start,end,year);
  }
  await db.batch([
  db.prepare(aurellePoolLockSql),claimReceipt,charterSettle,db.prepare(crownIssuanceSql).bind(shiftId),
  db.prepare("UPDATE work_shifts SET claimed_at=? WHERE id=? AND clerk_user_id=? AND claimed_at IS NULL AND EXISTS(SELECT 1 FROM aurelle_charter_settlements WHERE shift_id=work_shifts.id AND clerk_user_id=?)").bind(iso,shiftId,userId,userId),
  ]);
 }
 else if(command.action==='aurelle-start-work') {
 const plain='4 food contributed to charter estate supply';
 const clockRow=options.seasonFarming?await db.prepare("SELECT epoch_seconds FROM world_clock WHERE id='main'").first<{epoch_seconds:number}>():null;
 const scaled=farmingShiftYield(plain,aurelleJob.foodOutput,seasonAt(clockRow?{epochSeconds:Number(clockRow.epoch_seconds),nowSeconds:now}:null));
 await db.batch([
 db.prepare(aurelleStartReceiptSql).bind(id,now,userId,id),db.prepare(aurelleStartSql).bind(iso,new Date((now+7200)*1000).toISOString(),id,userId),
 db.prepare(aurelleStartDebitSql).bind(iso,userId,id),
 db.prepare("UPDATE aurelle_receipts SET capacity_applied=1 WHERE id=? AND clerk_user_id=? AND action='aurelle-start-work' AND EXISTS(SELECT 1 FROM work_shifts WHERE id=? AND clerk_user_id=?)").bind(id,userId,id,userId),
 // #1033: stamp once, in this batch. A replay or a settled shift does not match the unstamped line.
 ...(scaled?[db.prepare('UPDATE work_shifts SET output=? WHERE id=? AND clerk_user_id=? AND claimed_at IS NULL AND output=?').bind(scaled.output,id,userId,plain)]:[]),
 ]);
 }
 else if(command.action==='aurelle-claim-work'){
  // #957: always write a Crown issuance for the food-estate wage; #885 cap guard only while the flag is on (flag-off settle binds stay byte-identical).
  // #1033: flag off ignores any stamp and does not read work_shifts.output (Architect: a mid-shift flag flip pays the unseasoned amount).
  // Flag on: bind a stamped count only when this base's season table can produce it; otherwise aurelleSettleSql stays byte-identical.
  let food:number|null=null;
  if(options.seasonFarming&&shiftId){
   const saved=(await db.prepare('SELECT output FROM work_shifts WHERE id=? AND clerk_user_id=? AND work_order_id=?').bind(shiftId,userId,aurelleJob.id).first<{output:string}>())?.output??'';
   const stamped=storedFoodUnits(saved,aurelleJob.foodOutput);
   food=stamped===aurelleJob.foodOutput?null:stamped;
  }
  let claimReceipt=db.prepare(aurelleClaimReceiptSql).bind(id,now,shiftId,userId,iso,id);
  let foodSettle=db.prepare(aurelleSettleSql).bind(now,id,userId);
  let capStart=0,capEnd=0,capYear=0;
  if(options.emissionCaps){
   const epoch=Number((await db.prepare("SELECT epoch_seconds FROM world_clock WHERE id='main'").first<{epoch_seconds:number}>())?.epoch_seconds??0);
   const yearSeconds=30*86400; // emissionCapsConfig.gameYearSeconds
   capYear=Math.floor(Math.max(0,now-epoch)/yearSeconds)+1;
   capStart=epoch+(capYear-1)*yearSeconds; capEnd=capStart+yearSeconds;
   claimReceipt=db.prepare(aurelleClaimReceiptSql+crownYearCapSql).bind(id,now,shiftId,userId,iso,id,capStart,capEnd,capYear);
   foodSettle=db.prepare(aurelleSettleSql+crownYearCapSql).bind(now,id,userId,capStart,capEnd,capYear);
  }
  if(food!=null){
   const seasonSql=aurelleSettleSql.replace('800,4,2,?','800,?,2,?');
   foodSettle=db.prepare(options.emissionCaps?seasonSql+crownYearCapSql:seasonSql).bind(...(options.emissionCaps?[food,now,id,userId,capStart,capEnd,capYear]:[food,now,id,userId]));
  }
  await db.batch([
  db.prepare(aurellePoolLockSql),claimReceipt,foodSettle,db.prepare(crownFoodEstateIssuanceSql).bind(shiftId),
  db.prepare("UPDATE work_shifts SET claimed_at=? WHERE id=? AND clerk_user_id=? AND claimed_at IS NULL AND EXISTS(SELECT 1 FROM aurelle_receipts WHERE id=? AND clerk_user_id=? AND action='aurelle-claim-work' AND shift_id=work_shifts.id) AND EXISTS(SELECT 1 FROM aurelle_settlements WHERE shift_id=work_shifts.id AND clerk_user_id=?)").bind(iso,shiftId,userId,id,userId,userId),
  ]);
 }
 else if(command.action==='aurelle-buy-food') await db.batch([
 db.prepare(aurelleBuyReceiptSql).bind(id,quantity,now,userId,quantity,quantity,quantity,id),db.prepare(aurelleBuySql).bind(id,userId,quantity),
 ]);
 else await db.batch([
 db.prepare(aurelleMealReceiptSql).bind(id,now,userId,now+aurelleMealSeconds-mealSeconds,id),db.prepare(aurelleMealSql).bind(id,userId),db.prepare(aurelleMealCapacitySql).bind(iso,userId,id),
 db.prepare("UPDATE aurelle_receipts SET capacity_applied=1 WHERE id=? AND clerk_user_id=? AND action='aurelle-household-meal'").bind(id,userId),
 ]);
 const recorded=await receipt();
 if(recorded&&!matches(recorded))return {status:409,error:'Request identifier is bound to a different account, action or quantity.'};
 return recorded?{status:200}:{status:409,error:'Charter action unavailable. Check citizenship, active shift, completion time, capacity, estate funds, food and meal cooldown.'};
}
