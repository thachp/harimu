import {env} from 'cloudflare:workers';
import {authenticatedUserId} from '@/lib/auth';
import {getDatabase} from '@/lib/db';
import {isSameOriginCommand,readCommandObject} from '@/lib/command-request';
import {validPetitionId} from '@/lib/collective-petitions';
import {readAddressArchive} from '@/lib/weekly-addresses';
export const dynamic='force-dynamic';
const presidiumOptions=()=>({korundPresidium:(env as unknown as {HARIMU_KORUND_PRESIDIUM_ENABLED?:string}).HARIMU_KORUND_PRESIDIUM_ENABLED==='true'});
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
async function context(request:Request){const userId=await authenticatedUserId(request);if(!userId)return null;const db=await getDatabase();const nation=(await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{nation_id:string|null}>())?.nation_id;return {db,userId,nationId:nation??null,now:Math.floor(Date.now()/1000)};}
export async function GET(request:Request){
 const ctx=await context(request);if(!ctx)return json({error:'Sign in required.'},401);if(!ctx.nationId)return json({error:'Choose citizenship before reading addresses.'},403);
 const raw=new URL(request.url).searchParams.get('beforeWeek');if(raw!==null&&(!/^\d{1,8}$/.test(raw)||Number(raw)<1))return json({error:'Invalid archive page.'},400);
 const archive=await readAddressArchive(ctx.db,ctx.userId,ctx.nationId,ctx.now,raw===null?undefined:Number(raw),presidiumOptions());
 return archive?json(archive):json({error:'Your nation’s authored address archive is not available.'},404);
}
export async function POST(request:Request){
 if(!isSameOriginCommand(request))return json({error:'Same-origin request required.'},403);
 const ctx=await context(request);if(!ctx)return json({error:'Sign in required.'},401);if(!ctx.nationId)return json({error:'Choose citizenship before reacting.'},403);
 let body:Record<string,unknown>;try{body=await readCommandObject(request,2048);}catch{return json({error:'Expected a bounded reaction command.'},400);}
 if(body.action!=='react'||!validPetitionId(body.requestId)||typeof body.addressId!=='string'||body.addressId.length>80||!['agree','disagree'].includes(String(body.reaction)))return json({error:'Choose agree or disagree and use a valid request identifier.'},400);
 if(body.expectedNationId!==ctx.nationId)return json({error:'Citizenship changed. Refresh your citizen before reacting.'},409);
 const id=(body.requestId as string).toLowerCase();
 await ctx.db.prepare(`INSERT OR IGNORE INTO address_reactions(request_id,address_id,user_id,reaction,reacted_at)
 SELECT ?,a.id,c.clerk_user_id,?,? FROM weekly_addresses a JOIN citizens c ON c.clerk_user_id=? AND c.nation_id=a.nation_id WHERE a.id=? AND a.nation_id=?`).bind(id,body.reaction,ctx.now,ctx.userId,body.addressId,ctx.nationId).run();
 const receipt=await ctx.db.prepare('SELECT address_id,user_id,reaction FROM address_reactions WHERE request_id=?').bind(id).first<{address_id:string;user_id:string;reaction:string}>();
 if(!receipt||receipt.address_id!==body.addressId||receipt.user_id!==ctx.userId||receipt.reaction!==body.reaction)return json({error:'Reaction unavailable or already recorded. Retry your original reaction without editing it.'},409);
 return json({ok:true,...await readAddressArchive(ctx.db,ctx.userId,ctx.nationId,ctx.now,undefined,presidiumOptions())});
}
