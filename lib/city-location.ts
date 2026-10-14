import type {GameDatabase} from './database-contract';
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
 await db.prepare(`INSERT INTO citizen_city_locations(user_id,nation_id,home_city_id,current_city_id,updated_at)
 SELECT clerk_user_id,nation_id,?,?,? FROM citizens WHERE clerk_user_id=? AND nation_id=?
 ON CONFLICT(user_id) DO UPDATE SET nation_id=excluded.nation_id,home_city_id=excluded.home_city_id,current_city_id=excluded.current_city_id,updated_at=excluded.updated_at
 WHERE citizen_city_locations.nation_id!=excluded.nation_id OR citizen_city_locations.home_city_id!=excluded.home_city_id OR citizen_city_locations.current_city_id NOT IN (${placeholders})`)
 .bind(capital.id,capital.id,now,userId,nationId,...ids).run();
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
