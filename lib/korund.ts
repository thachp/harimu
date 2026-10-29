import type {GameDatabase} from './database-contract';
import {activeRationQueue,readRationQueue,executeRationQueue,queueIdentifierUsed,type RationQueue} from './korund-queue';
import type { WorkShift } from './work-shifts';
import { isKorundPost, korundPoolSql, korundPosts, laborNoteBrigadeIssuanceSql, laborNoteIssuanceSql, laborNoteMonthCapSql, latestPostSql, postDebitSql, postReceiptSql, postSettleSql, postStartSql, postWorkOrderSql, korundPostTerms } from './korund-posts'; // #886 (b), #885, #957
import { readBureau, setPreferences, requestAssignment, type BureauView } from './labor-bureau';
import { laborNoteSql, laborNoteBinds } from './korund-wallet';
import { readGray, postOffer, acceptOffer, type GrayView } from './gray-market';
import {readWalletStreetRate,type WalletStreetRate} from './wallet-street-rate'; // #758 (display only)
import {planMedals,korundMedalOwnFood} from './korund-medals-rules'; // #737
import {korundPlanStanding,type KorundPlanStanding} from './korund-standing-rules'; // #994
import {korundRationCut,korundRationRecoveryCities,applyRationCut,shortfallPercent,type KorundRationCut,korundShortfall,type KorundShortfall,korundWeeklyQuotaFood,korundWeekSeconds,readCouponsAndQuota,korundCouponGoods,korundCouponRedeemSql,type KorundCoupon,type KorundQuota} from './korund-coupons';
import { farmingShiftYield, leadingFoodUnits, storedFoodUnits } from './season-yield.ts'; // #1033
export const korundJob = {id:'korund-food-production',name:'State food-production brigade',capacityCost:4,hours:2,wageMinor:800,foodOutput:4} as const;
export const gameWeekSeconds = korundWeekSeconds;
export const korundSchemas = [
 `CREATE TABLE korund_resources (id TEXT PRIMARY KEY, initial_food INTEGER NOT NULL CHECK(initial_food>=0), initial_minor INTEGER NOT NULL CHECK(initial_minor>=0))`,
 `CREATE TABLE korund_work_starts (id TEXT PRIMARY KEY REFERENCES work_shifts(id), capacity_applied INTEGER NOT NULL DEFAULT 0 CHECK(capacity_applied IN (0,1)))`,
 `CREATE TABLE korund_settlements (shift_id TEXT PRIMARY KEY REFERENCES work_shifts(id), clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id), wage_minor INTEGER NOT NULL CHECK(wage_minor=800), food_output INTEGER NOT NULL CHECK(food_output>=1), settled_at INTEGER NOT NULL)`,
 `CREATE TABLE korund_rations (id TEXT PRIMARY KEY, clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id), game_week INTEGER NOT NULL CHECK(game_week>=1), quantity INTEGER NOT NULL CHECK(quantity=2), occurred_at INTEGER NOT NULL, UNIQUE(clerk_user_id,game_week))`,
 `CREATE TABLE korund_meals (id TEXT PRIMARY KEY, clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id), quantity INTEGER NOT NULL CHECK(quantity=2), occurred_at INTEGER NOT NULL, capacity_applied INTEGER NOT NULL DEFAULT 0 CHECK(capacity_applied IN (0,1)))`,
] as const;
import { streetShortageLine } from './wallet-street-rate'; // #968: shortage line on the rumored street rate (display only)
export const korundPublicFoodSql = `SELECT initial_food+COALESCE((SELECT SUM(food_output) FROM korund_settlements),0)-COALESCE((SELECT SUM(quantity) FROM korund_rations),0) AS food, initial_minor-COALESCE((SELECT SUM(wage_minor) FROM korund_settlements),0)-COALESCE((SELECT SUM(wage_minor) FROM korund_post_settlements),0) AS funds FROM korund_resources WHERE id='state'`; // #886 (b): literal = korund-posts korundPoolSql (tests/korund.test.py reads this text)
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
 AND 800<=(SELECT initial_minor-COALESCE((SELECT SUM(wage_minor) FROM korund_settlements),0)-COALESCE((SELECT SUM(wage_minor) FROM korund_post_settlements),0) FROM korund_resources WHERE id='state')`;
/** #906: the first statement of every pool-paid claim batch. It row-locks Korund's state pool (a no-op write), so on Postgres a concurrent claim waits here until
 *  this one commits, and its guard (READ COMMITTED: a fresh snapshot per statement) then sees this wage. Without it two claims could both pass `800<=pool`
 *  (QA2 on #900). It does not rely on the adapter's global writer lock; SQLite/D1 batches are already serial. */
export const korundPoolLockSql="UPDATE korund_resources SET initial_minor=initial_minor WHERE id='state'";
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
 coupons?:KorundCoupon[];quota?:KorundQuota;bureau?:BureauView;gray?:GrayView;medals?:{total:number;lastWeek:boolean};planStanding?:KorundPlanStanding;shortfall?:KorundShortfall|null;rationCut?:KorundRationCut|null;rationRecovery?:true;bureauTsr?:true;streetRate?:WalletStreetRate|null;clothingQuantity?:number;goodsQuantity?:number };
export type KorundCommand = {action:'korund-start-work'|'korund-claim-work'|'korund-redeem-ration'|'korund-household-meal'|'korund-join-ration-queue'|'korund-cancel-ration-queue'|'korund-redeem-coupon'|'korund-set-preferences'|'korund-request-assignment'|'korund-gray-post-offer'|'korund-gray-accept-offer'; requestId?:string;amountMinor?:number;askRate?:number;offerId?:string;preferences?:string[];shiftId?:string;queueId?:string;coupon?:'clothing'|'goods';gameWeek?:number};
const uuid=(v:unknown):v is string=>typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export function validKorundCommand(body:Record<string,unknown>):body is Record<string,unknown>&KorundCommand {
 // #235 (flag-gated at execution): preferences are three job ids; the assignment request carries only an id.
 if(body.action==='korund-set-preferences')return uuid(body.requestId)&&Array.isArray(body.preferences)&&Object.keys(body).every(k=>['action','requestId','preferences'].includes(k));
 if(body.action==='korund-request-assignment')return uuid(body.requestId)&&Object.keys(body).every(k=>['action','requestId'].includes(k));
 // #43 (flag-gated at execution): a gray-market offer carries whole-number terms; accepting names the offer.
 if(body.action==='korund-gray-post-offer')return uuid(body.requestId)&&Object.keys(body).every(k=>['action','requestId','amountMinor','askRate'].includes(k));
 if(body.action==='korund-gray-accept-offer')return uuid(body.requestId)&&uuid(body.offerId)&&Object.keys(body).every(k=>['action','requestId','offerId'].includes(k));
 if(body.action==='korund-cancel-ration-queue')return uuid(body.requestId)&&uuid(body.queueId);
 if(body.action==='korund-redeem-coupon')return uuid(body.requestId)&&(body.coupon==='clothing'||body.coupon==='goods')&&(body.gameWeek===undefined||(Number.isInteger(body.gameWeek)&&Number(body.gameWeek)>=1))&&Object.keys(body).every(k=>['action','requestId','coupon','gameWeek'].includes(k));
 return body.action==='korund-claim-work' ? uuid(body.shiftId)&&(body.requestId===undefined||uuid(body.requestId)) : ['korund-start-work','korund-redeem-ration','korund-household-meal','korund-join-ration-queue'].includes(String(body.action)) && uuid(body.requestId);
}
/** #737: Plan medals for closed weeks, derived on read (read-only). Only weeks where this citizen settled at least the medal share are candidates;
 * for each, the unit's food that week is summed. Week k (1-based) spans [epoch+(k-1)*gameWeekSeconds, epoch+k*gameWeekSeconds). */
async function readMedals(db:GameDatabase,userId:string,weekStart:number,weekNumber:number){
 const epoch=weekStart-(weekNumber-1)*gameWeekSeconds;
 const own=(await db.prepare('SELECT settled_at,food_output FROM korund_settlements WHERE clerk_user_id=? AND settled_at>=? AND settled_at<?').bind(userId,epoch,weekStart).all<{settled_at:number;food_output:number}>()).results;
 const byWeek=new Map<number,number>();for(const r of own){const k=Math.floor((Number(r.settled_at)-epoch)/gameWeekSeconds)+1;byWeek.set(k,(byWeek.get(k)??0)+Number(r.food_output));}
 const weeks=await Promise.all([...byWeek].filter(([,f])=>f>=korundMedalOwnFood).map(async([k,ownFood])=>{
  const s=epoch+(k-1)*gameWeekSeconds,row=await db.prepare('SELECT COALESCE(SUM(food_output),0) AS n FROM korund_settlements WHERE settled_at>=? AND settled_at<?').bind(s,s+gameWeekSeconds).first<{n:number}>();
  return {week:k,ownFood,unitFood:Number(row?.n??0)};}));
 return planMedals(weeks,weekNumber,korundWeeklyQuotaFood);
}
/** #759/#776: unit food in the closed week before `weekStart`. */
const closedWeekFood=async(db:GameDatabase,weekStart:number)=>Number((await db.prepare('SELECT COALESCE(SUM(food_output),0) AS n FROM korund_settlements WHERE settled_at>=? AND settled_at<?').bind(weekStart-gameWeekSeconds,weekStart).first<{n:number}>())?.n??0);
async function week(db:GameDatabase,now:number) {
 const row=await db.prepare("SELECT epoch_seconds FROM world_clock WHERE id='main'").first<{epoch_seconds:number}>();
 // #205: before any write path has started the clock, read the epoch advanceWorld would record (tick-aligned now).
 const clock={epoch_seconds:row?Number(row.epoch_seconds):Math.floor(now/7200)*7200};
 const index=Math.floor(Math.max(0,now-clock.epoch_seconds)/gameWeekSeconds);
 const start=clock.epoch_seconds+index*gameWeekSeconds;
 return {number:index+1,start,end:start+gameWeekSeconds,expiresAt:new Date((start+gameWeekSeconds)*1000).toISOString()};
}
export async function readKorund(db:GameDatabase,userId:string,now:number,options:{mvpJobTypes?:boolean;emissionCaps?:boolean;laborBureau?:boolean;grayMarket?:boolean;grayDailyCap?:boolean;graySuspicion?:boolean;graySeizure?:boolean;medals?:boolean;standing?:boolean;shortfall?:boolean;rationCut?:boolean;rationStability?:boolean;rationRecovery?:boolean;bureauTsr?:boolean;streetRate?:boolean;grayRationRise?:boolean}={}):Promise<KorundPlan> {
 const w=await week(db,now);
 const [citizen,ledger,shifts]=await Promise.all([
 db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{nation_id:string}>(),
 // Funds, public food, wallet, private food and food-coupon use share one read snapshot. Clothing/goods coupons and
 // the quota bar are read afterwards by readCouponsAndQuota (a separate round-trip; display only, never a guard).
 db.prepare(`SELECT initial_food+COALESCE((SELECT SUM(food_output) FROM korund_settlements),0)-COALESCE((SELECT SUM(quantity) FROM korund_rations),0) AS public_food,
 ${korundPoolSql} AS funds,
 ${laborNoteSql('?')} AS wallet,
 COALESCE((SELECT SUM(quantity) FROM korund_rations WHERE clerk_user_id=?),0)-COALESCE((SELECT SUM(quantity) FROM korund_meals WHERE clerk_user_id=?),0) AS food,
 EXISTS(SELECT 1 FROM korund_rations WHERE clerk_user_id=? AND game_week=?) AS coupon_used,
 (SELECT MAX(occurred_at) FROM korund_meals WHERE clerk_user_id=?) AS last_meal
 FROM korund_resources WHERE id='state'`).bind(...laborNoteBinds(userId),userId,userId,userId,w.number,userId)
 .first<{public_food:number;funds:number;wallet:number;food:number;coupon_used:number;last_meal:number|null}>(),
 db.prepare(`SELECT s.* FROM work_shifts s JOIN korund_work_starts k ON k.id=s.id WHERE s.clerk_user_id=? ORDER BY s.started_at DESC LIMIT 20`).bind(userId).all<{id:string;work_order_id:string;order_name:string;output:string;capacity_spent:number;started_at:string;completes_at:string;claimed_at:string|null}>(),
 ]);
 const extra=await readCouponsAndQuota(db,userId,w.number,Boolean(ledger?.coupon_used),w.start,w.end);
 const bureau=options.laborBureau&&citizen?.nation_id==='korund'?{bureau:await readBureau(db,userId,now)}:{};
 // #43: the gray market is in the plan only with HARIMU_GRAY_MARKET_ENABLED on, and only for a Korund citizen.
 const gray=options.grayMarket&&citizen?.nation_id==='korund'?{gray:await readGray(db,userId,now,{dailyCap:options.grayDailyCap===true,suspicion:options.graySuspicion===true,seizure:options.graySeizure===true})}:{};
 const medalRow=options.medals&&citizen?.nation_id==='korund'?await readMedals(db,userId,w.start,w.number):null;
 const medals=medalRow?{medals:medalRow}:{};
 // #994: Standing is the #737 medal total, derived on this read. No extra query and no write of citizens.standing. Needs the medals read.
 const planStanding=options.standing&&medalRow?{planStanding:korundPlanStanding(medalRow)}:{};
 // #759: last closed week's unit food vs the quota (read-only, Korund only, flag on only); null = met or no closed week yet.
 const korund=citizen?.nation_id==='korund',prevFood=korund&&(options.shortfall||options.rationCut)&&w.number>=2?await closedWeekFood(db,w.start):null;
 const shortfall=options.shortfall&&korund?{shortfall:prevFood===null?null:korundShortfall(w.number-1,prevFood)}:{};
 // #776: a closed-week shortfall withdraws coupons from this week's book (read-only; redeem refuses them in executeKorund).
 const cut=options.rationCut&&korund?korundRationCut(w.number,prevFood===null?0:shortfallPercent(prevFood)):null;
 if(cut&&extra.coupons)extra.coupons=applyRationCut(extra.coupons,cut);
 // #967: the same cut names the Stability step on the notice. The score itself is written on the world tick, not here.
 const rationCut=options.rationCut&&korund?{rationCut:cut&&options.rationStability?{...cut,stability:true as const}:cut}:{};
 // #983: the met week after that cut. Flag off: no read and no key, so the plan shape is unchanged.
 const recovery=options.rationRecovery&&korund&&(await korundRationRecoveryCities(db,w.start-(w.number-1)*gameWeekSeconds,now))>0?{rationRecovery:true as const}:{};
 // #1000: Bureau TSR quote under the LN balance. No query: the panel formats walletMinor. Flag off: no key.
 const bureauTsr=options.bureauTsr&&citizen?.nation_id==='korund'?{bureauTsr:true as const}:{};
 // #758: rumored street rate under the wallet, Korund only, flag on only; null = not heard of the gray market (hidden).
 // QA1 on #775: the rumor needs the gray market itself on (HARIMU_GRAY_MARKET_ENABLED) as well as the street-rate flag.
 const streetRate=options.streetRate&&options.grayMarket&&citizen?.nation_id==='korund'?{streetRate:await readWalletStreetRate(db,userId,now)}:{};
 // #968: a current #776 cut adds one shortage line on the rumored street rate. Display only; post and accept are unchanged.
 if(options.grayRationRise&&cut){const line=streetShortageLine();const board=(gray as {gray?:GrayView}).gray;if(board)board.shortage=line;const heard=(streetRate as {streetRate?:WalletStreetRate|null}).streetRate;if(heard)heard.shortage=line;}
 return {...extra,...bureau,...gray,...medals,...planStanding,...shortfall,...rationCut,...recovery,...bureauTsr,...streetRate,available:citizen?.nation_id==='korund',mode:'bounded state planning',assignment:korundJob,walletMinor:ledger?.wallet??0,foodQuantity:ledger?.food??0,
 publicFoodRemaining:ledger?.public_food??0,publicFundMinor:ledger?.funds??0,gameWeek:w.number,couponFoodRemaining:ledger?.coupon_used?0:2,couponExpiresAt:w.expiresAt,
 queue:citizen?.nation_id==='korund'?await readRationQueue(db,userId,w.number,now):{waiting:0,requestId:null,position:null},mealReadyAt:ledger?.last_meal==null?null:new Date((ledger.last_meal+7200)*1000).toISOString(),shifts:shifts.results.map(s=>({id:s.id,orderName:s.order_name,output:s.output,capacitySpent:s.capacity_spent,currency:'LN',wageMinor:800,...(isKorundPost(s.work_order_id)?{}:{rewardItem:'state food',rewardQuantity:leadingFoodUnits(s.output)}),startedAt:s.started_at,completesAt:s.completes_at,claimedAt:s.claimed_at}))};
}
export async function executeKorund(db:GameDatabase,userId:string,command:KorundCommand,now:number,options:{mvpJobTypes?:boolean;emissionCaps?:boolean;laborBureau?:boolean;grayMarket?:boolean;grayDailyCap?:boolean;graySuspicion?:boolean;graySeizure?:boolean;medals?:boolean;shortfall?:boolean;rationCut?:boolean;seasonFarming?:boolean}={}) {
 const nation=await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{nation_id:string}>();
 if(command.action==='korund-gray-post-offer'||command.action==='korund-gray-accept-offer'){
  // #43: the gray market ships off; with the flag off these actions are not found and change nothing.
  if(!options.grayMarket)return {status:404,reason:'disabled',error:'Not found.'};
  if(nation?.nation_id!=='korund')return {status:403,reason:'korund_only',error:'Korund citizenship required.'};
  const requestId=command.requestId!.toLowerCase();
  return command.action==='korund-gray-post-offer'?postOffer(db,userId,{amountMinor:command.amountMinor,askRate:command.askRate},requestId,now,{dailyCap:options.grayDailyCap===true}):acceptOffer(db,userId,command.offerId!.toLowerCase(),requestId,now,{dailyCap:options.grayDailyCap===true,seizure:options.graySeizure===true});
 }
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
 if(command.action==='korund-redeem-coupon'&&options.rationCut&&(command.coupon==='goods'||command.coupon==='clothing')){
  // #776: a coupon withdrawn by this week's ration cut cannot be redeemed (same closed-week rule as the read model).
  const w=await week(db,now),cut=korundRationCut(w.number,w.number>=2?shortfallPercent(await closedWeekFood(db,w.start)):0);
  if(cut?.withdrawn.includes(command.coupon))return {status:409,reason:'ration_cut',error:`${command.coupon==='goods'?'Goods':'Clothing'} coupon withdrawn this week: plan output fell short.`};
 }
 if(command.action==='korund-redeem-coupon')return redeemCoupon(db,userId,id,command.coupon!,now,command.gameWeek);
 if(await queueIdentifierUsed(db,id))return {status:409,error:'Request identifier already used for a ration queue action.'};
 if(command.action==='korund-start-work') {
 const conflicting=await db.prepare('SELECT id FROM korund_rations WHERE id=? UNION ALL SELECT id FROM korund_meals WHERE id=?').bind(id,id).first();
 if(conflicting) return {status:409,error:'Request identifier already used for another action.'};
 const existing=await db.prepare('SELECT clerk_user_id,work_order_id FROM work_shifts WHERE id=?').bind(id).first<{clerk_user_id:string;work_order_id:string}>();
 if(existing) return existing.clerk_user_id===userId&&(existing.work_order_id===korundJob.id||isKorundPost(existing.work_order_id))?{status:200,replayed:true}:{status:409,error:'Work identifier already used.'};
 // #886 (b), flag on only: the citizen's latest Labor Bureau post, when it is a playable post, is the shift they work; otherwise the brigade below, unchanged.
 const post=options.mvpJobTypes?(await db.prepare(latestPostSql).bind(userId).first<{job_id:string}>())?.job_id:undefined;
 if(isKorundPost(post)){
  const job=korundPosts[post];
  await db.batch([db.prepare(postWorkOrderSql).bind(post,job.name,job.output),
  db.prepare(postStartSql).bind(id,post,job.name,job.output,iso,new Date((now+korundPostTerms.hours*3600)*1000).toISOString(),userId,userId),
  db.prepare(postReceiptSql).bind(id,userId,post),db.prepare(postDebitSql).bind(iso,userId,id),
  db.prepare('UPDATE korund_work_starts SET capacity_applied=1 WHERE id=? AND EXISTS(SELECT 1 FROM work_shifts WHERE id=? AND clerk_user_id=?)').bind(id,id,userId)]);
  const started=await db.prepare('SELECT id FROM work_shifts WHERE id=? AND clerk_user_id=?').bind(id,userId).first();
  return started?{status:200}:{status:409,error:'Finish your active shift or check your Work Capacity before starting the assigned job.'};
 }
 const plain='4 food contributed to state ration supply';
 const scaled=options.seasonFarming?await farmingShiftYield(db,plain,korundJob.foodOutput,now*1000,true):null;
 await db.batch([
 db.prepare(korundStartSql).bind(id,iso,new Date((now+7200)*1000).toISOString(),userId,userId,id,id,id,id),
 db.prepare(korundStartReceiptSql).bind(id,userId),db.prepare(korundDebitSql).bind(iso,userId,id),
 db.prepare('UPDATE korund_work_starts SET capacity_applied=1 WHERE id=? AND EXISTS(SELECT 1 FROM work_shifts WHERE id=? AND clerk_user_id=?)').bind(id,id,userId),
 // #1033: stamp once, in this batch. A replay or a settled shift does not match the unstamped line.
 ...(scaled?[db.prepare('UPDATE work_shifts SET output=? WHERE id=? AND clerk_user_id=? AND claimed_at IS NULL AND output=?').bind(scaled.output,id,userId,plain)]:[]),
 ]);
 const started=await db.prepare('SELECT id FROM work_shifts WHERE id=? AND clerk_user_id=?').bind(id,userId).first();
 return started?{status:200}:{status:409,error:'Finish your active shift or check your Work Capacity before starting the assigned job.'};
 }
 if(command.action==='korund-claim-work') {
 const shiftId=command.shiftId!.toLowerCase();
 // #886 (b): a post shift settles into korund_post_settlements with its Labor Note issuance record, in one batch (keyed on the shift, not the flag).
 const order=await db.prepare('SELECT work_order_id FROM work_shifts WHERE id=? AND clerk_user_id=?').bind(shiftId,userId).first<{work_order_id:string}>();
 if(isKorundPost(order?.work_order_id)){
  // #885: when emission caps are on, append the monthly Charter Limit guard; flag off keeps the original postSettleSql binds byte-identical.
  let postSettle=db.prepare(postSettleSql).bind(now,shiftId,userId,iso);
  if(options.emissionCaps){
   const epoch=Number((await db.prepare("SELECT epoch_seconds FROM world_clock WHERE id='main'").first<{epoch_seconds:number}>())?.epoch_seconds??0);
   const monthSeconds=216000; // emissionCapsConfig.gameMonthSeconds
   const month=Math.floor(Math.max(0,now-epoch)/monthSeconds)+1;
   const start=epoch+(month-1)*monthSeconds, end=start+monthSeconds;
   postSettle=db.prepare(postSettleSql+laborNoteMonthCapSql).bind(now,shiftId,userId,iso,start,end);
  }
  await db.batch([db.prepare(korundPoolLockSql),postSettle,db.prepare(laborNoteIssuanceSql).bind(shiftId),
  db.prepare('UPDATE work_shifts SET claimed_at=? WHERE id=? AND clerk_user_id=? AND claimed_at IS NULL AND EXISTS(SELECT 1 FROM korund_post_settlements WHERE shift_id=work_shifts.id AND clerk_user_id=?)').bind(iso,shiftId,userId,userId)]);
  const paid=await db.prepare('SELECT shift_id FROM korund_post_settlements WHERE shift_id=? AND clerk_user_id=?').bind(shiftId,userId).first();
  return paid?{status:200}:{status:409,error:'Assigned shift is unavailable, unfinished, or the finite Labor Note fund cannot pay it yet.'};
 }
 // #957: always write a Labor Note issuance for the brigade wage; #885 cap guard only while the flag is on (flag-off settle binds stay byte-identical).
 // #1033: food other than 4 is bound only when the start line stored a season mark. Otherwise korundSettleSql stays byte-identical.
 const savedFood=options.seasonFarming?(await db.prepare('SELECT output FROM work_shifts WHERE id=? AND clerk_user_id=? AND work_order_id=?').bind(shiftId,userId,korundJob.id).first<{output:string}>())?.output:undefined;
 const food=savedFood===undefined?null:storedFoodUnits(savedFood,korundJob.foodOutput);
 let brigadeSettle=db.prepare(korundSettleSql).bind(now,shiftId,userId,iso);
 let capStart=0,capEnd=0;
 if(options.emissionCaps){
  const epoch=Number((await db.prepare("SELECT epoch_seconds FROM world_clock WHERE id='main'").first<{epoch_seconds:number}>())?.epoch_seconds??0);
  const monthSeconds=216000; // emissionCapsConfig.gameMonthSeconds
  const month=Math.floor(Math.max(0,now-epoch)/monthSeconds)+1;
  capStart=epoch+(month-1)*monthSeconds; capEnd=capStart+monthSeconds;
  brigadeSettle=db.prepare(korundSettleSql+laborNoteMonthCapSql).bind(now,shiftId,userId,iso,capStart,capEnd);
 }
 if(food!=null){
  const seasonSql=korundSettleSql.replace('800,4,?','800,?,?,?');
  brigadeSettle=db.prepare(options.emissionCaps?seasonSql+laborNoteMonthCapSql:seasonSql).bind(...(options.emissionCaps?[food,now,shiftId,userId,iso,capStart,capEnd]:[food,now,shiftId,userId,iso]));
 }
 await db.batch([db.prepare(korundPoolLockSql),brigadeSettle,db.prepare(laborNoteBrigadeIssuanceSql).bind(shiftId),
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
 await db.prepare(korundCouponRedeemSql(laborNoteSql('?'))).bind(id,w.number,coupon,good.item,good.priceMinor,now,userId,userId,w.number,coupon,good.priceMinor,...laborNoteBinds(userId)).run();
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

/** The LN balance, from the one shared formula in lib/korund-wallet (wages - coupons + gray-market trades). */
export async function korundLaborNoteBalance(db:GameDatabase,userId:string){
 const row=await db.prepare(`SELECT ${laborNoteSql('?')} AS balance`).bind(...laborNoteBinds(userId)).first<{balance:number}>();
 return Number(row?.balance??0);
}
