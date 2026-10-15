import {readCityLocation} from '@/lib/city-location';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { travelBlock } from '@/lib/travel';
import { env } from 'cloudflare:workers';
import { postSquareSql, readSquare, uuidPattern, validSquareText } from '@/lib/square-chat';
import { latchAfterWrite } from '@/lib/first-week-server';
export const dynamic='force-dynamic';
async function context(request:Request) {
  const userId=await authenticatedUserId(request);
  if(!userId)return null;
  const db=await getDatabase();
  const profile=await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{nation_id:string|null}>();
  return {db,userId,nationId:profile?.nation_id??null,now:Math.floor(Date.now()/1000)};
}
const privateResponse=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request:Request) {
  const ctx=await context(request);
  if(!ctx)return privateResponse({error:'Sign in required.'},401);
  if(!ctx.nationId)return privateResponse({error:'Enroll in a nation first.'},403);
  return privateResponse(await readSquare(ctx.db,ctx.userId,ctx.nationId,ctx.now));
}
// #194: a square post can complete a first-week goal; latch after a successful write.
export async function POST(request:Request) {
  const response=await handleSquarePost(request);if(!response.ok)return response;
  const userId=await authenticatedUserId(request);if(!userId)return response;
  return latchAfterWrite(await getDatabase(),response,[userId],Math.floor(Date.now()/1000));
}
async function handleSquarePost(request:Request) {
  if(request.headers.get('Origin')!==new URL(request.url).origin)return privateResponse({error:'Same-origin request required.'},403);
  if(Number(request.headers.get('Content-Length')??0)>4096)return privateResponse({error:'Request too large.'},413);
  const ctx=await context(request);
  if(!ctx)return privateResponse({error:'Sign in required.'},401);
  if(!ctx.nationId)return privateResponse({error:'Enroll in a nation first.'},403);
  let body: Record<string,unknown>;
  try { const reader=request.body?.getReader();if(!reader)throw Error();const chunks:Uint8Array[]=[];let size=0;for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>4096){await reader.cancel();throw Error();}chunks.push(part.value);}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}const raw=new TextDecoder().decode(bytes);const parsed=JSON.parse(raw);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error();body=parsed; }catch{return privateResponse({error:'Invalid request.'},400);}
  const {db,userId,nationId,now}=ctx;
  if((body.action==='post'||body.action==='delete')&&typeof body.expectedNationId!=='string')return privateResponse({error:'Refresh the conversation before submitting a nation-scoped command.'},400);
  if(body.expectedNationId!==undefined&&body.expectedNationId!==nationId)return privateResponse({error:'Citizenship changed. Refresh your citizen before reopening the conversation.'},409);
  if(body.action==='post'){const blocked=await travelBlock(db,userId,now,(env as unknown as {HARIMU_TRAVEL_ENABLED?:string}).HARIMU_TRAVEL_ENABLED==='true');if(blocked)return privateResponse({error:blocked,reason:'traveling'},409);} // #123
  if(body.action==='presence') {
    if(typeof body.active!=='boolean')return privateResponse({error:'Invalid presence choice.'},400);
    const location=await readCityLocation(db,userId,nationId,now);
    if((body.expectedCityId!==undefined&&body.expectedCityId!==location.currentCityId)||(body.cityId!==undefined&&body.cityId!==location.currentCityId))return privateResponse({error:'City changed. Refresh your current city before sharing presence.'},409);
    if(body.active){const refreshed=await db.prepare(`INSERT INTO square_presence(user_id,nation_id,expires_at) SELECT clerk_user_id,nation_id,? FROM citizens WHERE clerk_user_id=? AND nation_id=? AND EXISTS(SELECT 1 FROM citizen_city_locations WHERE user_id=? AND nation_id=? AND current_city_id=?) ON CONFLICT(user_id) DO UPDATE SET nation_id=excluded.nation_id,expires_at=excluded.expires_at`).bind(now+90,userId,nationId,userId,nationId,location.currentCityId).run();
    if(!refreshed.meta.changes)return privateResponse({error:'City changed. Refresh your current city before sharing presence.'},409);}
    else await db.prepare('DELETE FROM square_presence WHERE user_id=?').bind(userId).run();
  } else if(body.action==='delete') {
    if(typeof body.id!=='string'||!uuidPattern.test(body.id))return privateResponse({error:'Invalid message.'},400);
    const result=await db.prepare('UPDATE square_messages SET deleted=1,body=? WHERE id=? AND user_id=? AND nation_id=? AND EXISTS(SELECT 1 FROM citizens WHERE clerk_user_id=? AND nation_id=?)').bind('[removed]',body.id.toLowerCase(),userId,nationId,userId,nationId).run();
    if(!result.meta.changes)return privateResponse({error:'Message unavailable.'},404);
  } else if(body.action==='post') {
    if(typeof body.id!=='string'||!uuidPattern.test(body.id)||!validSquareText(body.text))return privateResponse({error:'Use 1–280 plain-text characters and a valid request ID.'},400);
    const id=body.id.toLowerCase();const text=body.text.trim();
    const existing=await db.prepare('SELECT user_id,body,deleted,nation_id FROM square_messages WHERE id=?').bind(id).first<{user_id:string;body:string;deleted:number;nation_id:string}>();
    if(existing) {
      if(existing.user_id!==userId||existing.nation_id!==nationId||existing.body!==text||existing.deleted)return privateResponse({error:'Request already used.'},409);
    } else {
      await db.prepare('INSERT OR IGNORE INTO square_handles(user_id,handle) VALUES (?,?)').bind(userId,`Citizen-${crypto.randomUUID().replaceAll('-','').slice(0,16)}`).run();
      const result=await db.prepare(postSquareSql).bind(id,text,now,userId,nationId,id,userId,now-10,userId,now-3600).run();
      if(!result.meta.changes) {
        const replay=await db.prepare('SELECT user_id,body,nation_id,deleted FROM square_messages WHERE id=?').bind(id).first<{user_id:string;body:string;nation_id:string;deleted:number}>();
        if(!replay||replay.user_id!==userId||replay.body!==text||replay.nation_id!==nationId||replay.deleted){
          const current=await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{nation_id:string|null}>();
          if(current?.nation_id!==nationId)return privateResponse({error:'Citizenship changed. Refresh your citizen before reopening the conversation.'},409);
          return privateResponse({error:'Wait 10 seconds between messages; limit 20 per hour.'},429);
        }
      }
    }
  } else return privateResponse({error:'Unknown action.'},400);
  return privateResponse(await readSquare(db,userId,nationId,now));
}
