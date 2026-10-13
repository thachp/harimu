import {authenticatedUserId} from '@/lib/auth';
import {getDatabase} from '@/lib/db';
import {isSameOriginCommand,readCommandObject} from '@/lib/command-request';
import {cityForNation} from '@/lib/cities';
import {cityPresence,readCityLocation} from '@/lib/city-location';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
async function context(request:Request){
 const userId=await authenticatedUserId(request);if(!userId)return null;
 const db=await getDatabase();const citizen=await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{nation_id:string|null}>();
 return {db,userId,nationId:citizen?.nation_id??null,now:Math.floor(Date.now()/1000)};
}
export async function GET(request:Request){
 const ctx=await context(request);if(!ctx)return json({error:'Sign in required.'},401);if(!ctx.nationId)return json({error:'Enroll in a nation first.'},403);
 return json({...await readCityLocation(ctx.db,ctx.userId,ctx.nationId,ctx.now),presence:await cityPresence(ctx.db,ctx.nationId,ctx.now)});
}
export async function POST(request:Request){
 if(!isSameOriginCommand(request))return json({error:'Same-origin request required.'},403);
 const ctx=await context(request);if(!ctx)return json({error:'Sign in required.'},401);if(!ctx.nationId)return json({error:'Enroll in a nation first.'},403);
 let body:Record<string,unknown>;try{body=await readCommandObject(request);}catch{return json({error:'Invalid request.'},400);}
 if(body.action!=='travel'||typeof body.cityId!=='string'||!cityForNation(ctx.nationId,body.cityId))return json({error:'Choose a city in your current nation.'},400);
 const location=await readCityLocation(ctx.db,ctx.userId,ctx.nationId,ctx.now);
 await ctx.db.batch([
 ctx.db.prepare(`DELETE FROM square_presence WHERE user_id=? AND EXISTS(SELECT 1 FROM citizen_city_locations WHERE user_id=? AND nation_id=? AND current_city_id!=?)`).bind(ctx.userId,ctx.userId,ctx.nationId,body.cityId),
 ctx.db.prepare(`UPDATE citizen_city_locations SET current_city_id=?,updated_at=? WHERE user_id=? AND nation_id=? AND EXISTS(SELECT 1 FROM citizens WHERE clerk_user_id=? AND nation_id=?)`).bind(body.cityId,ctx.now,ctx.userId,ctx.nationId,ctx.userId,ctx.nationId),
 ]);
 const current=await readCityLocation(ctx.db,ctx.userId,ctx.nationId,ctx.now);
 return json({...current,homeCityId:location.homeCityId,presence:await cityPresence(ctx.db,ctx.nationId,ctx.now)});
}
