/** #781: move your home city within your own nation. One immutable row per move in home_city_moves, keyed by the request id:
 *  it is the fee's debit leg (netted from citizen_wallet_balances, the Spark is destroyed, credited to nobody) and the cooldown clock.
 *  A replayed request id returns the stored move and never charges twice. Any refusal writes nothing.
 *  #992: closed systems (Korund, Meridian; Varkand at Amber/Red) also need a single-use internal residence permit for the target city
 *  (HARIMU_INTERNAL_PERMIT_ENABLED). Flag off: identical to #781. */
import type {GameDatabase} from './database-contract';
import {cityForNation} from './cities';
import {readCityLocation} from './city-location';
import {laborNoteSql} from './korund-wallet';
import {homeCityMovesSchema,homeCityMovesIndex} from './market-orders';
export const homeMoveFeeMinor=1000; // 10 units of the nation's wallet currency (ARC ruling on #781)
/** ARC ruling on #781: the fee is charged in the nation's own wallet currency. Royal Favor is not money; a nation without a wallet currency here
 *  (Aurelle, and any nation not yet open) refuses the move with not_open_yet and charges nothing. */
export const homeMoveCurrencies:Readonly<Record<string,'SPK'|'LN'>>={kindle:'SPK',korund:'LN'};
export const homeMoveCurrency=(nationId:string):'SPK'|'LN'|null=>homeMoveCurrencies[nationId]??null;
const balanceSql={SPK:'COALESCE((SELECT balance FROM citizen_wallet_balances w WHERE w.clerk_user_id=c.clerk_user_id),0)',LN:laborNoteSql('c.clerk_user_id')} as const;
export const homeMoveCooldownSeconds=7*86400; // 7 real days
/** #992 [ASSUMPTION]: auto-grant wait after a permit request. Docs name the permit but not the latency; 60 real seconds is short for preview QA. */
export const internalPermitWaitSeconds=60;
export type VarkandAlert='green'|'amber'|'red';
/** Korund and Meridian always; Varkand only at Amber or Red. Open nations never. */
export function requiresInternalPermit(nationId:string,alert:VarkandAlert='green'):boolean{
 if(nationId==='korund'||nationId==='meridian')return true;
 return nationId==='varkand'&&(alert==='amber'||alert==='red');
}
export const internalResidencePermitsSchema=`CREATE TABLE IF NOT EXISTS internal_residence_permits (
 request_id TEXT PRIMARY KEY,
 clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 nation_id TEXT NOT NULL, to_city_id TEXT NOT NULL,
 requested_at INTEGER NOT NULL, consumed_at INTEGER
)`;
export const internalResidencePermitsIndex=`CREATE INDEX IF NOT EXISTS idx_internal_permits_user_city ON internal_residence_permits(clerk_user_id, to_city_id, requested_at)`;
// The move table lives in lib/market-orders.ts beside market_trade_fees so the SQL fixture tests (tests/*.test.py) can read it with the wallet view.
export const homeCityMoveSchemas=[homeCityMovesSchema,homeCityMovesIndex,internalResidencePermitsSchema,internalResidencePermitsIndex];
export type HomeMoveRefusal='not_open_yet'|'request_conflict'|'not_your_nation'|'already_home'|'cooldown'|'funds'|'permit_required';
export type HomeMoveResult={ok:true;homeCityId:string;feeMinor:number;currency:string;nextMoveAt:number;replayed:boolean}|{ok:false;reason:HomeMoveRefusal;status:number;nextMoveAt?:number};
export type PermitStatus='none'|'pending'|'granted';
export type PermitView={status:PermitStatus;cityId:string;availableAt:number|null;requestId:string|null};
export type PermitOpts={enabled:boolean;alert?:VarkandAlert};
/** Earliest time the next move is allowed: last move + 7 days (allowed AT the boundary), or null when never moved. */
export async function nextHomeMoveAt(db:GameDatabase,userId:string):Promise<number|null>{
 const row=await db.prepare('SELECT MAX(moved_at) AS last FROM home_city_moves WHERE clerk_user_id=?').bind(userId).first<{last:number|null}>();
 return row?.last==null?null:Number(row.last)+homeMoveCooldownSeconds;
}
type PermitRow={request_id:string;to_city_id:string;requested_at:number;consumed_at:number|null};
async function activePermit(db:GameDatabase,userId:string,cityId:string):Promise<PermitRow|null>{
 return (await db.prepare('SELECT request_id,to_city_id,requested_at,consumed_at FROM internal_residence_permits WHERE clerk_user_id=? AND to_city_id=? AND consumed_at IS NULL ORDER BY requested_at DESC LIMIT 1').bind(userId,cityId).first<PermitRow>())??null;
}
export function permitStatusOf(row:PermitRow|null,now:number):PermitView{
 if(!row)return {status:'none',cityId:'',availableAt:null,requestId:null};
 const availableAt=Number(row.requested_at)+internalPermitWaitSeconds;
 return {status:now>=availableAt?'granted':'pending',cityId:row.to_city_id,availableAt,requestId:row.request_id};
}
export async function readPermitForCity(db:GameDatabase,userId:string,cityId:string,now:number):Promise<PermitView>{
 return permitStatusOf(await activePermit(db,userId,cityId),now);
}
export type PermitRequestResult={ok:true;permit:PermitView;replayed:boolean}|{ok:false;reason:'not_required'|'not_your_nation'|'request_conflict';status:number};
/** Request (or replay) a single-use permit for a target city. Granted automatically after internalPermitWaitSeconds. */
export async function requestInternalPermit(db:GameDatabase,userId:string,nationId:string,cityId:string,requestId:string,now:number,opts:PermitOpts):Promise<PermitRequestResult>{
 if(!opts.enabled||!requiresInternalPermit(nationId,opts.alert??'green'))return {ok:false,reason:'not_required',status:400};
 if(!cityForNation(nationId,cityId))return {ok:false,reason:'not_your_nation',status:403};
 const prior=await db.prepare('SELECT clerk_user_id,to_city_id,requested_at,consumed_at FROM internal_residence_permits WHERE request_id=?').bind(requestId).first<PermitRow&{clerk_user_id:string}>();
 if(prior){
  if(prior.clerk_user_id!==userId)return {ok:false,reason:'request_conflict',status:409};
  return {ok:true,permit:permitStatusOf(prior,now),replayed:true};
 }
 const open=await activePermit(db,userId,cityId);
 if(open)return {ok:true,permit:permitStatusOf(open,now),replayed:false};
 await db.prepare('INSERT INTO internal_residence_permits(request_id,clerk_user_id,nation_id,to_city_id,requested_at,consumed_at) VALUES (?,?,?,?,?,NULL)').bind(requestId,userId,nationId,cityId,now).run();
 return {ok:true,permit:permitStatusOf({request_id:requestId,to_city_id:cityId,requested_at:now,consumed_at:null},now),replayed:false};
}
export async function moveHomeCity(db:GameDatabase,userId:string,nationId:string,cityId:string,requestId:string,now:number,opts:PermitOpts={enabled:false}):Promise<HomeMoveResult>{
 const prior=await db.prepare('SELECT clerk_user_id,to_city_id,fee_minor,currency,moved_at FROM home_city_moves WHERE request_id=?').bind(requestId).first<{clerk_user_id:string;to_city_id:string;fee_minor:number;currency:string;moved_at:number}>();
 if(prior){
  if(prior.clerk_user_id!==userId)return {ok:false,reason:'request_conflict',status:409};
  return {ok:true,homeCityId:prior.to_city_id,feeMinor:Number(prior.fee_minor),currency:prior.currency,nextMoveAt:Number(prior.moved_at)+homeMoveCooldownSeconds,replayed:true};
 }
 if(!cityForNation(nationId,cityId))return {ok:false,reason:'not_your_nation',status:403};
 const location=await readCityLocation(db,userId,nationId,now);
 if(location.homeCityId===cityId)return {ok:false,reason:'already_home',status:409};
 const next=await nextHomeMoveAt(db,userId);
 if(next!==null&&now<next)return {ok:false,reason:'cooldown',status:409,nextMoveAt:next};
 const needPermit=opts.enabled&&requiresInternalPermit(nationId,opts.alert??'green');
 if(needPermit){
  const permit=await activePermit(db,userId,cityId);
  if(!permit||now<Number(permit.requested_at)+internalPermitWaitSeconds)return {ok:false,reason:'permit_required',status:403};
 }
 const currency=homeMoveCurrency(nationId);
 if(!currency)return {ok:false,reason:'not_open_yet',status:403};
 // One guarded insert: same nation, cooldown and funds are re-checked atomically, so a race cannot double-charge or overdraw.
 const permitGate=needPermit?`AND EXISTS(SELECT 1 FROM internal_residence_permits p WHERE p.clerk_user_id=c.clerk_user_id AND p.to_city_id=? AND p.consumed_at IS NULL AND p.requested_at<=?)`:'';
 const moveBinds=needPermit
  ?[requestId,location.homeCityId,cityId,currency,homeMoveFeeMinor,now,userId,nationId,now-homeMoveCooldownSeconds,homeMoveFeeMinor,cityId,now-internalPermitWaitSeconds]
  :[requestId,location.homeCityId,cityId,currency,homeMoveFeeMinor,now,userId,nationId,now-homeMoveCooldownSeconds,homeMoveFeeMinor];
 const stmts=[
  db.prepare(`INSERT INTO home_city_moves(request_id,clerk_user_id,nation_id,from_city_id,to_city_id,currency,fee_minor,moved_at)
   SELECT ?,c.clerk_user_id,c.nation_id,?,?,?,?,? FROM citizens c WHERE c.clerk_user_id=? AND c.nation_id=?
   AND NOT EXISTS(SELECT 1 FROM home_city_moves m WHERE m.clerk_user_id=c.clerk_user_id AND m.moved_at>?)
   AND ${balanceSql[currency]}>=? ${permitGate}
   ON CONFLICT(request_id) DO NOTHING`).bind(...moveBinds),
  db.prepare(`UPDATE citizen_city_locations SET home_city_id=?,updated_at=? WHERE user_id=? AND nation_id=?
   AND EXISTS(SELECT 1 FROM home_city_moves m WHERE m.request_id=? AND m.clerk_user_id=? AND m.moved_at=?)`).bind(cityId,now,userId,nationId,requestId,userId,now),
 ];
 if(needPermit)stmts.push(db.prepare(`UPDATE internal_residence_permits SET consumed_at=? WHERE clerk_user_id=? AND to_city_id=? AND consumed_at IS NULL AND requested_at<=?
  AND EXISTS(SELECT 1 FROM home_city_moves m WHERE m.request_id=? AND m.clerk_user_id=? AND m.moved_at=?)`).bind(now,userId,cityId,now-internalPermitWaitSeconds,requestId,userId,now));
 await db.batch(stmts);
 const stored=await db.prepare('SELECT clerk_user_id,moved_at FROM home_city_moves WHERE request_id=?').bind(requestId).first<{clerk_user_id:string;moved_at:number}>();
 if(stored&&stored.clerk_user_id===userId)return {ok:true,homeCityId:cityId,feeMinor:homeMoveFeeMinor,currency,nextMoveAt:Number(stored.moved_at)+homeMoveCooldownSeconds,replayed:Number(stored.moved_at)!==now};
 if(needPermit){
  const permit=await activePermit(db,userId,cityId);
  if(!permit||now<Number(permit.requested_at)+internalPermitWaitSeconds)return {ok:false,reason:'permit_required',status:403};
 }
 const raced=await nextHomeMoveAt(db,userId);
 if(raced!==null&&now<raced)return {ok:false,reason:'cooldown',status:409,nextMoveAt:raced};
 return {ok:false,reason:'funds',status:402};
}
