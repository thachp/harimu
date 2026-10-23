import {authenticatedUserId} from '@/lib/auth';
import {getDatabase} from '@/lib/db';
import {env} from 'cloudflare:workers';
import {isSameOriginCommand,readCommandObject} from '@/lib/command-request';
import {readCityLocation} from '@/lib/city-location';
import {homeMoveCooldownSeconds,homeMoveFeeMinor,moveHomeCity,nextHomeMoveAt} from '@/lib/home-move';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
// #781: flag off is a 404 before auth and before any database read.
const enabled=()=>(env as unknown as {HARIMU_HOME_CITY_MOVE_ENABLED?:string}).HARIMU_HOME_CITY_MOVE_ENABLED==='true';
const notFound=()=>json({error:'Not found.'},404);
async function context(request:Request){
 const userId=await authenticatedUserId(request);if(!userId)return null;
 const db=await getDatabase();const citizen=await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{nation_id:string|null}>();
 return {db,userId,nationId:citizen?.nation_id??null,now:Math.floor(Date.now()/1000)};
}
export async function GET(request:Request){
 if(!enabled())return notFound();
 const ctx=await context(request);if(!ctx)return json({error:'Sign in required.'},401);if(!ctx.nationId)return json({error:'Enroll in a nation first.'},403);
 const location=await readCityLocation(ctx.db,ctx.userId,ctx.nationId,ctx.now);
 return json({...location,feeMinor:homeMoveFeeMinor,cooldownSeconds:homeMoveCooldownSeconds,nextMoveAt:await nextHomeMoveAt(ctx.db,ctx.userId)});
}
export async function POST(request:Request){
 if(!enabled())return notFound();
 if(!isSameOriginCommand(request))return json({error:'Same-origin request required.'},403);
 const ctx=await context(request);if(!ctx)return json({error:'Sign in required.'},401);if(!ctx.nationId)return json({error:'Enroll in a nation first.'},403);
 let body:Record<string,unknown>;try{body=await readCommandObject(request);}catch{return json({error:'Invalid request.'},400);}
 if(typeof body.cityId!=='string'||typeof body.requestId!=='string'||!/^[A-Za-z0-9-]{8,64}$/.test(body.requestId))return json({error:'Choose a city and send a request id.'},400);
 const result=await moveHomeCity(ctx.db,ctx.userId,ctx.nationId,body.cityId,body.requestId,ctx.now);
 return result.ok?json(result):json({error:result.reason,reason:result.reason,nextMoveAt:result.nextMoveAt??null},result.status);
}
