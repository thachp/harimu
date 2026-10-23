import type {GameDatabase} from './database-contract';
import {nationNotables} from './notable-choice';
import { capitalCityForNation, citiesForNation, cityForNation } from './cities';
export const cityLocationSchema=`CREATE TABLE IF NOT EXISTS citizen_city_locations (
 user_id TEXT PRIMARY KEY REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 nation_id TEXT NOT NULL, home_city_id TEXT NOT NULL, current_city_id TEXT NOT NULL, updated_at INTEGER NOT NULL
)`;
export type CityLocation={nationId:string;homeCityId:string;currentCityId:string};
export async function readCityLocation(db:GameDatabase,userId:string,nationId:string,now:number):Promise<CityLocation>{
 const capital=capitalCityForNation(nationId);if(!capital)throw new Error('Unknown nation city.');
 const ids=citiesForNation(nationId).map(city=>city.id);
 const placeholders=ids.map(()=>'?').join(',');
 // #781: a home recorded by a home_city_moves row for this nation and still a city of it is kept; otherwise (no move, nation changed, unknown city) home resets to the capital as before.
 const kept=`(citizen_city_locations.nation_id=excluded.nation_id AND citizen_city_locations.home_city_id IN (${placeholders}) AND EXISTS(SELECT 1 FROM home_city_moves m WHERE m.clerk_user_id=citizen_city_locations.user_id AND m.nation_id=excluded.nation_id AND m.to_city_id=citizen_city_locations.home_city_id))`;
 await db.prepare(`INSERT INTO citizen_city_locations(user_id,nation_id,home_city_id,current_city_id,updated_at)
 SELECT clerk_user_id,nation_id,?,?,? FROM citizens WHERE clerk_user_id=? AND nation_id=?
 ON CONFLICT(user_id) DO UPDATE SET home_city_id=CASE WHEN ${kept} THEN citizen_city_locations.home_city_id ELSE excluded.home_city_id END,
 current_city_id=CASE WHEN ${kept} AND citizen_city_locations.current_city_id IN (${placeholders}) THEN citizen_city_locations.current_city_id ELSE excluded.current_city_id END,
 nation_id=excluded.nation_id,updated_at=excluded.updated_at
 WHERE citizen_city_locations.nation_id!=excluded.nation_id OR citizen_city_locations.current_city_id NOT IN (${placeholders}) OR (citizen_city_locations.home_city_id!=excluded.home_city_id AND NOT ${kept})`)
 .bind(capital.id,capital.id,now,userId,nationId,...ids,...ids,...ids,...ids,...ids).run();
 const row=await db.prepare('SELECT nation_id,home_city_id,current_city_id FROM citizen_city_locations WHERE user_id=? AND nation_id=?').bind(userId,nationId).first<{nation_id:string;home_city_id:string;current_city_id:string}>();
 return {nationId,homeCityId:row?.home_city_id??capital.id,currentCityId:row?.current_city_id??capital.id};
}
export async function cityPresence(db:GameDatabase,nationId:string,now:number){
 const cities=citiesForNation(nationId),capital=capitalCityForNation(nationId);
 const rows=await db.prepare(`SELECT l.nation_id AS location_nation,l.current_city_id FROM square_presence p JOIN citizens c ON c.clerk_user_id=p.user_id AND c.nation_id=p.nation_id LEFT JOIN citizen_city_locations l ON l.user_id=p.user_id WHERE p.nation_id=? AND p.expires_at>?`).bind(nationId,now).all<{location_nation:string|null;current_city_id:string|null}>();
 return cities.map(city=>({cityId:city.id,present:rows.results.filter(row=>{
 const effective=row.location_nation===nationId&&row.current_city_id&&cityForNation(nationId,row.current_city_id)?row.current_city_id:capital?.id;
 return effective===city.id;
 }).length}));
}
/** #75: who else lives in this city. Humans appear once they have a city location row, i.e. after opening the city screen (GET /api/city). Public fields only: no user ids, wallets or coordinates. */
export type CoResident={key:string;name:string;nationId:string;kind:'human'|'ai';status:'working'|'idle';you:boolean};
export const coResidentHumanLimit=12,coResidentAiSample=3;
// #165: the AI cast is the nation's full Notable list (primary + #148 roster, active since #151), sampled per city below.
const aiCast=(nationId:string):readonly {id:string;name:string}[]=>nationNotables(nationId);
const hash=(text:string)=>{let h=2166136261;for(const ch of text){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)>>>0;}return h;};
/** Deterministic AI sample per city. AI working/idle is cosmetic: a hash that rotates hourly, not a simulation. */
export function aiCoResidents(nationId:string,cityId:string,now:number,roster:readonly {id:string;name:string}[]=aiCast(nationId)):CoResident[]{
 const cast=[...roster].sort((a,b)=>hash(cityId+a.id)-hash(cityId+b.id)).slice(0,coResidentAiSample);
 const hour=Math.floor(now/3600);
 return cast.map(ai=>({key:`ai:${ai.id}`,name:ai.name,nationId,kind:'ai',status:hash(`${ai.id}:${cityId}:${hour}`)%2?'working':'idle',you:false}));
}
export async function cityCoResidents(db:GameDatabase,viewerId:string,nationId:string,cityId:string,now:number):Promise<CoResident[]>{
 if(!cityForNation(nationId,cityId))return [];
 const rows=await db.prepare(`SELECT c.clerk_user_id AS id,c.display_name AS name,EXISTS(SELECT 1 FROM work_shifts s WHERE s.clerk_user_id=c.clerk_user_id AND s.claimed_at IS NULL AND s.completes_at>?) AS working
 FROM citizens c JOIN citizen_city_locations l ON l.user_id=c.clerk_user_id AND l.nation_id=c.nation_id
 WHERE c.nation_id=? AND l.current_city_id=? ORDER BY CASE WHEN c.clerk_user_id=? THEN 0 ELSE 1 END,l.updated_at DESC LIMIT ?`).bind(new Date(now*1000).toISOString(),nationId,cityId,viewerId,coResidentHumanLimit).all<{id:string;name:string|null;working:number|boolean}>();
 const humans=rows.results.map((row,index):CoResident=>({key:`h:${index}`,name:row.name?.trim()||'Citizen',nationId,kind:'human',status:Number(row.working)?'working':'idle',you:row.id===viewerId}));
 return [...humans,...aiCoResidents(nationId,cityId,now)];
}
