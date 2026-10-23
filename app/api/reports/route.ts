import {env} from 'cloudflare:workers';
import {authenticatedUserId} from '@/lib/auth';
import {getDatabase} from '@/lib/db';
import {isSameOriginCommand,readCommandObject} from '@/lib/command-request';
import {submitReport} from '@/lib/reports';
export const dynamic='force-dynamic';
const privateJson=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
/** #743 slice 1: POST only; the flag is checked before auth or any database access. */
export async function POST(request:Request){
 if((env as unknown as {HARIMU_REPORTS_ENABLED?:string}).HARIMU_REPORTS_ENABLED!=='true')return privateJson({error:'Not found.'},404);
 if(!isSameOriginCommand(request))return privateJson({error:'Same-origin request required.'},403);
 const userId=await authenticatedUserId(request);if(!userId)return privateJson({error:'Sign in required.'},401);
 let body;try{body=await readCommandObject(request,4096);}catch{return privateJson({error:'Invalid request.'},400);}
 const db=await getDatabase();
 const citizen=await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{nation_id:string|null}>();
 if(!citizen?.nation_id)return privateJson({error:'Enroll in a nation first.'},403);
 const result=await submitReport(db,userId,citizen.nation_id,body,Math.floor(Date.now()/1000));
 return privateJson(result.body,result.status);
}
