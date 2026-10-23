/** #781: move your home city within your own nation. One immutable row per move in home_city_moves, keyed by the request id:
 *  it is the fee's debit leg (netted from citizen_wallet_balances, the Spark is destroyed, credited to nobody) and the cooldown clock.
 *  A replayed request id returns the stored move and never charges twice. Any refusal writes nothing.
 *  TODO(#781): internal residence permits for Korund, Meridian and Varkand at Amber or Red are out of scope for this slice. */
import type {GameDatabase} from './database-contract';
import {cityForNation} from './cities';
import {readCityLocation} from './city-location';
export const homeMoveFeeMinor=1000; // 10 SPK [ASSUMPTION: the issue's "e.g. 10"]
export const homeMoveCooldownSeconds=7*86400; // 7 real days
export const homeCityMoveSchemas=[`CREATE TABLE IF NOT EXISTS home_city_moves (
 request_id TEXT PRIMARY KEY,
 clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 nation_id TEXT NOT NULL, from_city_id TEXT NOT NULL, to_city_id TEXT NOT NULL,
 fee_minor INTEGER NOT NULL CHECK(typeof(fee_minor) = 'integer' AND fee_minor > 0),
 moved_at INTEGER NOT NULL
)`,'CREATE INDEX IF NOT EXISTS idx_home_city_moves_user ON home_city_moves(clerk_user_id, moved_at)'];
export type HomeMoveRefusal='request_conflict'|'not_your_nation'|'already_home'|'cooldown'|'funds';
export type HomeMoveResult={ok:true;homeCityId:string;feeMinor:number;nextMoveAt:number;replayed:boolean}|{ok:false;reason:HomeMoveRefusal;status:number;nextMoveAt?:number};
/** Earliest time the next move is allowed: last move + 7 days (allowed AT the boundary), or null when never moved. */
export async function nextHomeMoveAt(db:GameDatabase,userId:string):Promise<number|null>{
 const row=await db.prepare('SELECT MAX(moved_at) AS last FROM home_city_moves WHERE clerk_user_id=?').bind(userId).first<{last:number|null}>();
 return row?.last==null?null:Number(row.last)+homeMoveCooldownSeconds;
}
export async function moveHomeCity(db:GameDatabase,userId:string,nationId:string,cityId:string,requestId:string,now:number):Promise<HomeMoveResult>{
 const prior=await db.prepare('SELECT clerk_user_id,to_city_id,fee_minor,moved_at FROM home_city_moves WHERE request_id=?').bind(requestId).first<{clerk_user_id:string;to_city_id:string;fee_minor:number;moved_at:number}>();
 if(prior){
  if(prior.clerk_user_id!==userId)return {ok:false,reason:'request_conflict',status:409};
  return {ok:true,homeCityId:prior.to_city_id,feeMinor:Number(prior.fee_minor),nextMoveAt:Number(prior.moved_at)+homeMoveCooldownSeconds,replayed:true};
 }
 if(!cityForNation(nationId,cityId))return {ok:false,reason:'not_your_nation',status:403};
 const location=await readCityLocation(db,userId,nationId,now);
 if(location.homeCityId===cityId)return {ok:false,reason:'already_home',status:409};
 const next=await nextHomeMoveAt(db,userId);
 if(next!==null&&now<next)return {ok:false,reason:'cooldown',status:409,nextMoveAt:next};
 // One guarded insert: same nation, cooldown and funds are re-checked atomically, so a race cannot double-charge or overdraw.
 await db.batch([
  db.prepare(`INSERT INTO home_city_moves(request_id,clerk_user_id,nation_id,from_city_id,to_city_id,fee_minor,moved_at)
   SELECT ?,c.clerk_user_id,c.nation_id,?,?,?,? FROM citizens c WHERE c.clerk_user_id=? AND c.nation_id=?
   AND NOT EXISTS(SELECT 1 FROM home_city_moves m WHERE m.clerk_user_id=c.clerk_user_id AND m.moved_at>?)
   AND COALESCE((SELECT balance FROM citizen_wallet_balances w WHERE w.clerk_user_id=c.clerk_user_id),0)>=?
   ON CONFLICT(request_id) DO NOTHING`).bind(requestId,location.homeCityId,cityId,homeMoveFeeMinor,now,userId,nationId,now-homeMoveCooldownSeconds,homeMoveFeeMinor),
  db.prepare(`UPDATE citizen_city_locations SET home_city_id=?,updated_at=? WHERE user_id=? AND nation_id=?
   AND EXISTS(SELECT 1 FROM home_city_moves m WHERE m.request_id=? AND m.clerk_user_id=? AND m.moved_at=?)`).bind(cityId,now,userId,nationId,requestId,userId,now),
 ]);
 const stored=await db.prepare('SELECT clerk_user_id,moved_at FROM home_city_moves WHERE request_id=?').bind(requestId).first<{clerk_user_id:string;moved_at:number}>();
 if(stored&&stored.clerk_user_id===userId)return {ok:true,homeCityId:cityId,feeMinor:homeMoveFeeMinor,nextMoveAt:Number(stored.moved_at)+homeMoveCooldownSeconds,replayed:Number(stored.moved_at)!==now};
 const raced=await nextHomeMoveAt(db,userId);
 if(raced!==null&&now<raced)return {ok:false,reason:'cooldown',status:409,nextMoveAt:raced};
 return {ok:false,reason:'funds',status:402};
}
