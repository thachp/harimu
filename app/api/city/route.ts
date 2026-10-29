import {authenticatedUserId} from '@/lib/auth';
import {getDatabase} from '@/lib/db';
import {startCityTravel} from '@/lib/travel';
import {env} from 'cloudflare:workers';
import {isSameOriginCommand,readCommandObject} from '@/lib/command-request';
import {cityForNation,cityImportsFields,citySpecialtyFields,cityCaptureNote,cityCivicUnitNote,cityGovernorFields} from '@/lib/cities'; // #996 specialty, #1001 imports, #1002 capture, #1006 civic unit, #1007 governor
import {cityCoResidents,cityPresence,readCityLocation} from '@/lib/city-location';
import {cityTierUnlockFields,cityTierFestivalNote} from '@/lib/city-tier'; // #979 / #984
import {flagOn} from '@/lib/flag-pack.mjs'; // #988 / #1003
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
async function context(request:Request){
 const userId=await authenticatedUserId(request);if(!userId)return null;
 const db=await getDatabase();const citizen=await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{nation_id:string|null}>();
 return {db,userId,nationId:citizen?.nation_id??null,now:Math.floor(Date.now()/1000)};
}

async function withTierUnlocks(db:Awaited<ReturnType<typeof getDatabase>>,nationId:string,cityId:string,body:Record<string,unknown>){
 const unlocksOn=flagOn(env,'HARIMU_CITY_TIER_UNLOCKS_ENABLED');
 const noteOn=flagOn(env,'HARIMU_CITY_TIER_FESTIVAL_NOTE_ENABLED');
 const specialtyOn=flagOn(env,'HARIMU_CITY_SPECIALTY_NOTE_ENABLED'); // #996
 const captureOn=flagOn(env,'HARIMU_CITY_CAPTURE_NOTE_ENABLED'); // #1002
 const civicOn=flagOn(env,'HARIMU_CITY_CIVIC_UNIT_NOTE_ENABLED'); // #1006
 const importsOn=flagOn(env,'HARIMU_CITY_IMPORTS_NOTE_ENABLED'); // #1001 direct string still wins
 const governorOn=flagOn(env,'HARIMU_CITY_GOVERNOR_NOTE_ENABLED'); // #1007
 if(!unlocksOn&&!noteOn&&!specialtyOn&&!captureOn&&!civicOn&&!importsOn&&!governorOn)return body;
 let tier=1;
 if(flagOn(env,'HARIMU_CITY_TIER_GROWTH_ENABLED')){
  const row=await db.prepare('SELECT tier FROM world_cities WHERE id=?').bind(cityId).first<{tier:number}>();
  if(row)tier=Number(row.tier);
 }
 let out:Record<string,unknown>={...body};
 if(unlocksOn)out={...out,...cityTierUnlockFields(tier)};
 if(noteOn)out={...out,festivalNote:cityTierFestivalNote(tier)}; // #984 read-only
 if(specialtyOn){const s=citySpecialtyFields(nationId,cityId);if(s)out={...out,...s};} // #996 catalog only
 if(captureOn){const n=cityCaptureNote(nationId,cityId);if(n)out={...out,captureNote:n};} // #1002
 if(civicOn){const n=cityCivicUnitNote(nationId);if(n)out={...out,civicUnitNote:n};} // #1006
 if(importsOn){const n=cityImportsFields(nationId,cityId);if(n)out={...out,...n};} // #1001 port / trade zone only
 if(governorOn)out={...out,...cityGovernorFields(nationId,tier)}; // #1007
 return out;
}
export async function GET(request:Request){
 const ctx=await context(request);if(!ctx)return json({error:'Sign in required.'},401);if(!ctx.nationId)return json({error:'Enroll in a nation first.'},403);
 const location=await readCityLocation(ctx.db,ctx.userId,ctx.nationId,ctx.now);
 return json(await withTierUnlocks(ctx.db,ctx.nationId,location.currentCityId,{...location,presence:await cityPresence(ctx.db,ctx.nationId,ctx.now),coResidents:await cityCoResidents(ctx.db,ctx.userId,ctx.nationId,location.currentCityId,ctx.now)}));
}
export async function POST(request:Request){
 if(!isSameOriginCommand(request))return json({error:'Same-origin request required.'},403);
 const ctx=await context(request);if(!ctx)return json({error:'Sign in required.'},401);if(!ctx.nationId)return json({error:'Enroll in a nation first.'},403);
 let body:Record<string,unknown>;try{body=await readCommandObject(request);}catch{return json({error:'Invalid request.'},400);}
 // #123 (ARC ruling on #264): with HARIMU_TRAVEL_ENABLED on, city travel is a timed journey; the instant #19 path below is unreachable.
 if((env as unknown as {HARIMU_TRAVEL_ENABLED?:string}).HARIMU_TRAVEL_ENABLED==='true'){
  if(body.action!=='travel'||typeof body.cityId!=='string')return json({error:'Choose a city in your current nation.'},400);
  const requestId=typeof body.requestId==='string'&&/^[A-Za-z0-9-]{8,64}$/.test(body.requestId)?body.requestId:crypto.randomUUID();
  const result=await startCityTravel(ctx.db,ctx.userId,body.cityId,requestId,ctx.now);
  return result.ok?json({...result,timed:true}):json({error:result.error,reason:result.reason},result.status);
 }
 if(body.action!=='travel'||typeof body.cityId!=='string'||!cityForNation(ctx.nationId,body.cityId))return json({error:'Choose a city in your current nation.'},400);
 const location=await readCityLocation(ctx.db,ctx.userId,ctx.nationId,ctx.now);
 const results=await ctx.db.batch([
 ctx.db.prepare(`DELETE FROM square_presence WHERE user_id=? AND EXISTS(SELECT 1 FROM citizens WHERE clerk_user_id=? AND nation_id=?) AND EXISTS(SELECT 1 FROM citizen_city_locations WHERE user_id=? AND nation_id=? AND current_city_id!=?)`).bind(ctx.userId,ctx.userId,ctx.nationId,ctx.userId,ctx.nationId,body.cityId),
 ctx.db.prepare(`UPDATE citizen_city_locations SET current_city_id=?,updated_at=? WHERE user_id=? AND nation_id=? AND EXISTS(SELECT 1 FROM citizens WHERE clerk_user_id=? AND nation_id=?)`).bind(body.cityId,ctx.now,ctx.userId,ctx.nationId,ctx.userId,ctx.nationId),
 ]);
 if(!results[1].meta.changes)return json({error:'Citizenship changed. Refresh your citizen before traveling.'},409);
 const current=await readCityLocation(ctx.db,ctx.userId,ctx.nationId,ctx.now);
 return json(await withTierUnlocks(ctx.db,ctx.nationId,current.currentCityId,{...current,homeCityId:location.homeCityId,presence:await cityPresence(ctx.db,ctx.nationId,ctx.now),coResidents:await cityCoResidents(ctx.db,ctx.userId,ctx.nationId,current.currentCityId,ctx.now)}));
}
