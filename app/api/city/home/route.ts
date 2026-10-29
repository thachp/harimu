import {authenticatedUserId} from '@/lib/auth';
import {getDatabase} from '@/lib/db';
import {env} from 'cloudflare:workers';
import {isSameOriginCommand,readCommandObject} from '@/lib/command-request';
import {readCityLocation} from '@/lib/city-location';
import {homeMoveCooldownSeconds,homeMoveCurrency,homeMoveFeeMinor,moveHomeCity,nextHomeMoveAt,readPermitForCity,requestInternalPermit,requiresInternalPermit,type VarkandAlert} from '@/lib/home-move';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
// #781: flag off is a 404 before auth and before any database read.
const enabled=()=>(env as unknown as {HARIMU_HOME_CITY_MOVE_ENABLED?:string}).HARIMU_HOME_CITY_MOVE_ENABLED==='true';
/** #992: closed-system permit gate. Off: move path identical to #781. */
const permitEnabled=()=>(env as unknown as {HARIMU_INTERNAL_PERMIT_ENABLED?:string}).HARIMU_INTERNAL_PERMIT_ENABLED==='true';
/** #992 [ASSUMPTION]: until the Alert Level writer lands, Varkand alert is green unless tests set HARIMU_VARKAND_ALERT. */
const varkandAlert=():VarkandAlert=>{const v=(env as unknown as {HARIMU_VARKAND_ALERT?:string}).HARIMU_VARKAND_ALERT;return v==='amber'||v==='red'||v==='green'?v:'green';};
const notFound=()=>json({error:'Not found.'},404);
const requestIdOk=(id:unknown):id is string=>typeof id==='string'&&/^[A-Za-z0-9-]{8,64}$/.test(id);
async function context(request:Request){
 const userId=await authenticatedUserId(request);if(!userId)return null;
 const db=await getDatabase();const citizen=await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{nation_id:string|null}>();
 return {db,userId,nationId:citizen?.nation_id??null,now:Math.floor(Date.now()/1000)};
}
function permitOpts(nationId:string){return {enabled:permitEnabled(),alert:nationId==='varkand'?varkandAlert():'green' as VarkandAlert};}
export async function GET(request:Request){
 if(!enabled())return notFound();
 const ctx=await context(request);if(!ctx)return json({error:'Sign in required.'},401);if(!ctx.nationId)return json({error:'Enroll in a nation first.'},403);
 const location=await readCityLocation(ctx.db,ctx.userId,ctx.nationId,ctx.now);
 const opts=permitOpts(ctx.nationId);
 const required=opts.enabled&&requiresInternalPermit(ctx.nationId,opts.alert);
 const cityId=new URL(request.url).searchParams.get('cityId');
 const permit=required&&cityId?await readPermitForCity(ctx.db,ctx.userId,cityId,ctx.now):null;
 return json({...location,feeMinor:homeMoveFeeMinor,currency:homeMoveCurrency(ctx.nationId),cooldownSeconds:homeMoveCooldownSeconds,nextMoveAt:await nextHomeMoveAt(ctx.db,ctx.userId),permitRequired:required,permit});
}
export async function POST(request:Request){
 if(!enabled())return notFound();
 if(!isSameOriginCommand(request))return json({error:'Same-origin request required.'},403);
 const ctx=await context(request);if(!ctx)return json({error:'Sign in required.'},401);if(!ctx.nationId)return json({error:'Enroll in a nation first.'},403);
 let body:Record<string,unknown>;try{body=await readCommandObject(request);}catch{return json({error:'Invalid request.'},400);}
 if(!requestIdOk(body.requestId)||typeof body.cityId!=='string')return json({error:'Choose a city and send a request id.'},400);
 const opts=permitOpts(ctx.nationId);
 if(body.action==='request-permit'){
  const result=await requestInternalPermit(ctx.db,ctx.userId,ctx.nationId,body.cityId,body.requestId,ctx.now,opts);
  return result.ok?json(result):json({error:result.reason,reason:result.reason},result.status);
 }
 const result=await moveHomeCity(ctx.db,ctx.userId,ctx.nationId,body.cityId,body.requestId,ctx.now,opts);
 return result.ok?json(result):json({error:result.reason,reason:result.reason,nextMoveAt:result.nextMoveAt??null},result.status);
}
