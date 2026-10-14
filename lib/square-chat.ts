import type {GameDatabase} from './database-contract';
import {readCityLocation,cityPresence} from './city-location';
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
export async function readSquare(db:GameDatabase,userId:string,nationId:string,now:number) {
  await db.batch([db.prepare('DELETE FROM square_messages WHERE posted_at<=?').bind(now-604800),db.prepare('DELETE FROM square_presence WHERE expires_at<=?').bind(now)]);
  const location=await readCityLocation(db,userId,nationId,now);
  const messages=await db.prepare(`SELECT m.id,h.handle,m.body,m.posted_at FROM square_messages m JOIN square_handles h ON h.user_id=m.user_id WHERE m.nation_id=? AND m.deleted=0 AND m.posted_at>? AND EXISTS (SELECT 1 FROM citizens WHERE clerk_user_id=? AND nation_id=?) ORDER BY m.posted_at DESC,m.id DESC LIMIT 50`).bind(nationId,now-604800,userId,nationId).all<{id:string;handle:string;body:string;posted_at:number}>();
  const presence=await cityPresence(db,nationId,now);
  const own = await db.prepare(`SELECT id FROM square_messages WHERE user_id=? AND nation_id=? AND deleted=0 AND posted_at>? ORDER BY posted_at DESC LIMIT 50`).bind(userId,nationId,now-604800).all<{id:string}>();
  const ownIds=new Set(own.results.map(row=>row.id));
  return {nationId,cityId:location.currentCityId,messages:messages.results.reverse().map(row=>({id:row.id,handle:row.handle,body:row.body,postedAt:row.posted_at,mine:ownIds.has(row.id)})),present:presence.find(city=>city.cityId===location.currentCityId)?.present??0};
}
