/** #881 (part 2): the global chat channel (docs §27 MVP chat: city, global, DMs). One channel for every enrolled citizen of every nation, on the
 *  lib/city-chat.ts pattern: 1-280 plain characters, 10 s between posts, 20 per hour, 7-day retention, own-post delete, the shared square handle,
 *  each post labeled with its author's nation, and the #790 operator shadow-mute. Not location-bound, so travel does not block it.
 *  Flag HARIMU_GLOBAL_CHAT_ENABLED (off in production). DMs follow. */
import type { GameDatabase } from './database-contract';
import { isShadowMuted, type MuteWindow } from './chat-shadow-mute';

export const globalChatSchemas = [
  `CREATE TABLE IF NOT EXISTS global_chat_messages (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id), nation_id TEXT NOT NULL, body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 280), posted_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS global_chat_messages_feed ON global_chat_messages(posted_at)`,
  `CREATE INDEX IF NOT EXISTS global_chat_messages_rate ON global_chat_messages(user_id, posted_at)`,
];
export const globalChatFlagOn = (b: unknown) => (b as { HARIMU_GLOBAL_CHAT_ENABLED?: string })?.HARIMU_GLOBAL_CHAT_ENABLED === 'true';
export const globalChatRetentionSeconds = 604800, globalChatGapSeconds = 10, globalChatHourlyLimit = 20, globalChatPageSize = 50;

/** Inserts only for an enrolled citizen (nation taken from the citizens row, never the client), inside the rate limits. 0 changes: replay, limit or unenrolled. */
export const postGlobalChatSql = `INSERT INTO global_chat_messages(id,user_id,nation_id,body,posted_at)
SELECT ?, clerk_user_id, nation_id, ?, ? FROM citizens WHERE clerk_user_id=? AND nation_id IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM global_chat_messages WHERE id=?)
AND NOT EXISTS (SELECT 1 FROM global_chat_messages WHERE user_id=? AND posted_at>?)
AND (SELECT COUNT(*) FROM global_chat_messages WHERE user_id=? AND posted_at>?)<${globalChatHourlyLimit}`;
export const postGlobalChatBinds = (id: string, text: string, now: number, userId: string) =>
  [id, text, now, userId, id, userId, now - globalChatGapSeconds, userId, now - 3600];

export type GlobalChatMessage = { id: string; handle: string; nationId: string; body: string; postedAt: number; mine: boolean };
/** The last 50 global messages (oldest first). A shadow-muted author's posts inside their windows are shown only to that author. */
export async function readGlobalChat(db: GameDatabase, userId: string, now: number, muted: ReadonlyMap<string, readonly MuteWindow[]> = new Map()) {
  await db.prepare('DELETE FROM global_chat_messages WHERE posted_at<=?').bind(now - globalChatRetentionSeconds).run();
  type Row = { id: string; user_id: string; handle: string; nation_id: string; body: string; posted_at: number };
  const rows = (await db.prepare(`SELECT m.id,m.user_id,h.handle,m.nation_id,m.body,m.posted_at FROM global_chat_messages m JOIN square_handles h ON h.user_id=m.user_id
    WHERE m.deleted=0 AND m.posted_at>? ORDER BY m.posted_at DESC,m.id DESC LIMIT 200`).bind(now - globalChatRetentionSeconds).all<Row>()).results
    .filter(row => row.user_id === userId || !isShadowMuted(muted, row.user_id, Number(row.posted_at))).slice(0, globalChatPageSize).reverse();
  return { messages: rows.map((row): GlobalChatMessage => ({ id: row.id, handle: row.handle, nationId: row.nation_id, body: row.body, postedAt: Number(row.posted_at), mine: row.user_id === userId })) };
}
