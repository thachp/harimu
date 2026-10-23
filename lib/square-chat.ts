import type {GameDatabase} from './database-contract';
import {readCityLocation,cityPresence} from './city-location';
import { SHADOW_MUTE_CHUNK } from './chat-shadow-mute';
export const squareSchema = [
`CREATE TABLE IF NOT EXISTS square_handles (user_id TEXT PRIMARY KEY REFERENCES citizens(clerk_user_id), handle TEXT NOT NULL UNIQUE)`,
`CREATE TABLE IF NOT EXISTS square_messages (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id), nation_id TEXT NOT NULL, body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 280), posted_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0)`,
`CREATE INDEX IF NOT EXISTS square_messages_scope ON square_messages(nation_id, posted_at)`,
`CREATE INDEX IF NOT EXISTS square_messages_rate ON square_messages(user_id, posted_at)`,
`CREATE TABLE IF NOT EXISTS square_presence (user_id TEXT PRIMARY KEY REFERENCES citizens(clerk_user_id), nation_id TEXT NOT NULL, expires_at INTEGER NOT NULL)`
];
export const postSquareSql = `INSERT INTO square_messages(id,user_id,nation_id,body,posted_at)
SELECT ?, clerk_user_id, nation_id, ?, ? FROM citizens
WHERE clerk_user_id=? AND nation_id=?
AND NOT EXISTS (SELECT 1 FROM square_messages WHERE id=?)
AND NOT EXISTS (SELECT 1 FROM square_messages WHERE user_id=? AND posted_at>?)
AND (SELECT COUNT(*) FROM square_messages WHERE user_id=? AND posted_at>?)<20`;
export {uuidPattern,validSquareText} from './square-chat-validation';
/** #790: `muted` (HARIMU_CHAT_SHADOW_MUTE, citizenId -> mutedAt) hides a listed author's posts made at or after mutedAt from every viewer except the
 *  author; their earlier posts stay visible. Empty: unchanged. Every query stays under D1's 100 bound parameters (see lib/chat-shadow-mute). */
export async function readSquare(db:GameDatabase,userId:string,nationId:string,now:number,muted:ReadonlyMap<string,number>=new Map()) {
  const hidden=[...muted].filter(([id])=>id!==userId);
  await db.batch([db.prepare('DELETE FROM square_messages WHERE posted_at<=?').bind(now-604800),db.prepare('DELETE FROM square_presence WHERE expires_at<=?').bind(now)]);
  const location=await readCityLocation(db,userId,nationId,now);
  const feedSql=`SELECT m.id,h.handle,m.body,m.posted_at FROM square_messages m JOIN square_handles h ON h.user_id=m.user_id WHERE m.nation_id=? AND m.deleted=0 AND m.posted_at>? AND EXISTS (SELECT 1 FROM citizens WHERE clerk_user_id=? AND nation_id=?) ORDER BY m.posted_at DESC,m.id DESC LIMIT 50`;
  type Row={id:string;handle:string;body:string;posted_at:number};
  const run=(filter:string,binds:(string|number)[])=>db.prepare(filter?feedSql.replace(' AND EXISTS',` AND ${filter} AND EXISTS`):feedSql).bind(nationId,now-604800,...binds,userId,nationId).all<Row>().then(r=>r.results);
  // #790: the base feed SQL stays one static literal (tests/square-chat.test.py reads it); the muted variants only insert an author filter.
  // Unlisted authors in one query; each listed author's pre-mute posts in chunks; merged in the feed's own order and cut to 50.
  const chunks:[string,number][][]=[];for(let i=0;i<hidden.length;i+=SHADOW_MUTE_CHUNK)chunks.push(hidden.slice(i,i+SHADOW_MUTE_CHUNK));
  const rows=!hidden.length?await run('',[]):[...await run(`m.user_id NOT IN (${hidden.map(()=>'?').join(',')})`,hidden.map(([id])=>id)),
    ...(await Promise.all(chunks.map(c=>run(`(${c.map(()=>'(m.user_id=? AND m.posted_at<?)').join(' OR ')})`,c.flatMap(([id,at])=>[id,at]))))).flat()]
    .sort((a,b)=>Number(b.posted_at)-Number(a.posted_at)||(a.id<b.id?1:a.id>b.id?-1:0)).slice(0,50);
  const messages={results:rows};
  const presence=await cityPresence(db,nationId,now);
  const own = await db.prepare(`SELECT id FROM square_messages WHERE user_id=? AND nation_id=? AND deleted=0 AND posted_at>? ORDER BY posted_at DESC LIMIT 50`).bind(userId,nationId,now-604800).all<{id:string}>();
  const ownIds=new Set(own.results.map(row=>row.id));
  return {nationId,cityId:location.currentCityId,messages:messages.results.reverse().map(row=>({id:row.id,handle:row.handle,body:row.body,postedAt:row.posted_at,mine:ownIds.has(row.id)})),present:presence.find(city=>city.cityId===location.currentCityId)?.present??0};
}
