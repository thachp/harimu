/** #881 (part 1): city chat channel (docs §27 MVP chat: city, global, DMs). One channel per city, on the lib/square-chat.ts pattern: a citizen reads and posts
 *  only in their current city (lib/city-location, server-derived, never from the client), 1-280 plain characters, 10 s between posts, 20 per hour, 7-day
 *  retention, own-post delete, the shared square handle and the #790 operator shadow-mute. Flag HARIMU_CITY_CHAT_ENABLED (off in production). Global and DMs follow. */
import type { GameDatabase } from './database-contract';
import { readCityLocation } from './city-location';
import { isShadowMuted, type MuteWindow } from './chat-shadow-mute';

export const cityChatSchemas = [
  `CREATE TABLE IF NOT EXISTS city_chat_messages (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id), nation_id TEXT NOT NULL, city_id TEXT NOT NULL, body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 280), posted_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS city_chat_messages_scope ON city_chat_messages(nation_id, city_id, posted_at)`,
  `CREATE INDEX IF NOT EXISTS city_chat_messages_rate ON city_chat_messages(user_id, posted_at)`,
];
export const cityChatFlagOn = (b: unknown) => (b as { HARIMU_CITY_CHAT_ENABLED?: string })?.HARIMU_CITY_CHAT_ENABLED === 'true';
export const cityChatRetentionSeconds = 604800, cityChatGapSeconds = 10, cityChatHourlyLimit = 20, cityChatPageSize = 50;

/** Inserts only for the citizen's own nation and the city the server says they are in, inside the rate limits. 0 changes: replay, limit or a stale city. */
export const postCityChatSql = `INSERT INTO city_chat_messages(id,user_id,nation_id,city_id,body,posted_at)
SELECT ?, c.clerk_user_id, c.nation_id, l.current_city_id, ?, ? FROM citizens c JOIN citizen_city_locations l ON l.user_id=c.clerk_user_id AND l.nation_id=c.nation_id
WHERE c.clerk_user_id=? AND c.nation_id=? AND l.current_city_id=?
AND NOT EXISTS (SELECT 1 FROM city_chat_messages WHERE id=?)
AND NOT EXISTS (SELECT 1 FROM city_chat_messages WHERE user_id=? AND posted_at>?)
AND (SELECT COUNT(*) FROM city_chat_messages WHERE user_id=? AND posted_at>?)<${cityChatHourlyLimit}`;
export const postCityChatBinds = (id: string, text: string, now: number, userId: string, nationId: string, cityId: string) =>
  [id, text, now, userId, nationId, cityId, id, userId, now - cityChatGapSeconds, userId, now - 3600];

export type CityChatMessage = { id: string; handle: string; body: string; postedAt: number; mine: boolean };
/** The current city's last 50 messages (oldest first). A shadow-muted author's posts inside their windows are shown only to that author. */
export async function readCityChat(db: GameDatabase, userId: string, nationId: string, now: number, muted: ReadonlyMap<string, readonly MuteWindow[]> = new Map()) {
  await db.prepare('DELETE FROM city_chat_messages WHERE posted_at<=?').bind(now - cityChatRetentionSeconds).run();
  const { currentCityId: cityId } = await readCityLocation(db, userId, nationId, now);
  type Row = { id: string; user_id: string; handle: string; body: string; posted_at: number };
  const rows = (await db.prepare(`SELECT m.id,m.user_id,h.handle,m.body,m.posted_at FROM city_chat_messages m JOIN square_handles h ON h.user_id=m.user_id
    WHERE m.nation_id=? AND m.city_id=? AND m.deleted=0 AND m.posted_at>? AND EXISTS (SELECT 1 FROM citizens WHERE clerk_user_id=? AND nation_id=?)
    ORDER BY m.posted_at DESC,m.id DESC LIMIT 200`).bind(nationId, cityId, now - cityChatRetentionSeconds, userId, nationId).all<Row>()).results
    .filter(row => row.user_id === userId || !isShadowMuted(muted, row.user_id, Number(row.posted_at))).slice(0, cityChatPageSize).reverse();
  return { nationId, cityId, messages: rows.map((row): CityChatMessage => ({ id: row.id, handle: row.handle, body: row.body, postedAt: Number(row.posted_at), mine: row.user_id === userId })) };
}
