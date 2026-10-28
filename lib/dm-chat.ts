/** #881 (part 3): direct-message chat (docs §27 MVP chat: city, global, DMs). One thread per pair of enrolled citizens, on the
 *  lib/global-chat.ts pattern: 1-280 plain characters, 10 s between posts, 20 per hour, 7-day retention, own-post delete,
 *  the shared square handle and the #790 operator shadow-mute. Peer is another enrolled citizen (any nation). Flag HARIMU_DM_CHAT_ENABLED (off in production). */
import type { GameDatabase } from './database-contract';
import { isShadowMuted, type MuteWindow } from './chat-shadow-mute';

export const dmChatSchemas = [
  `CREATE TABLE IF NOT EXISTS dm_chat_messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, sender_id TEXT NOT NULL REFERENCES citizens(clerk_user_id), peer_id TEXT NOT NULL REFERENCES citizens(clerk_user_id), body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 280), posted_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS dm_chat_messages_feed ON dm_chat_messages(conversation_id, posted_at)`,
  `CREATE INDEX IF NOT EXISTS dm_chat_messages_rate ON dm_chat_messages(sender_id, posted_at)`,
];
export const dmChatFlagOn = (b: unknown) => (b as { HARIMU_DM_CHAT_ENABLED?: string })?.HARIMU_DM_CHAT_ENABLED === 'true';
export const dmChatRetentionSeconds = 604800, dmChatGapSeconds = 10, dmChatHourlyLimit = 20, dmChatPageSize = 50;
/** Stable thread key for a pair (order-independent). */
export const dmConversationId = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Inserts only when both citizens are enrolled; nation is never taken from the client. 0 changes: replay, limit, self, or unenrolled peer. */
export const postDmChatSql = `INSERT INTO dm_chat_messages(id,conversation_id,sender_id,peer_id,body,posted_at)
SELECT ?, ?, s.clerk_user_id, p.clerk_user_id, ?, ? FROM citizens s JOIN citizens p ON p.clerk_user_id=? AND p.nation_id IS NOT NULL
WHERE s.clerk_user_id=? AND s.nation_id IS NOT NULL AND s.clerk_user_id<>p.clerk_user_id
AND NOT EXISTS (SELECT 1 FROM dm_chat_messages WHERE id=?)
AND NOT EXISTS (SELECT 1 FROM dm_chat_messages WHERE sender_id=? AND posted_at>?)
AND (SELECT COUNT(*) FROM dm_chat_messages WHERE sender_id=? AND posted_at>?)<${dmChatHourlyLimit}`;
export const postDmChatBinds = (id: string, conversationId: string, text: string, now: number, userId: string, peerId: string) =>
  [id, conversationId, text, now, peerId, userId, id, userId, now - dmChatGapSeconds, userId, now - 3600];

export type DmChatMessage = { id: string; handle: string; body: string; postedAt: number; mine: boolean };
/** Last 50 messages in the thread with peer (oldest first). Shadow-muted posts inside their windows show only to that author. */
export async function readDmChat(db: GameDatabase, userId: string, peerId: string, now: number, muted: ReadonlyMap<string, readonly MuteWindow[]> = new Map()) {
  await db.prepare('DELETE FROM dm_chat_messages WHERE posted_at<=?').bind(now - dmChatRetentionSeconds).run();
  const conversationId = dmConversationId(userId, peerId);
  type Row = { id: string; sender_id: string; handle: string; body: string; posted_at: number };
  const rows = (await db.prepare(`SELECT m.id,m.sender_id,h.handle,m.body,m.posted_at FROM dm_chat_messages m JOIN square_handles h ON h.user_id=m.sender_id
    WHERE m.conversation_id=? AND m.deleted=0 AND m.posted_at>? AND EXISTS (SELECT 1 FROM citizens WHERE clerk_user_id=? AND nation_id IS NOT NULL)
    ORDER BY m.posted_at DESC,m.id DESC LIMIT 200`).bind(conversationId, now - dmChatRetentionSeconds, userId).all<Row>()).results
    .filter(row => row.sender_id === userId || !isShadowMuted(muted, row.sender_id, Number(row.posted_at))).slice(0, dmChatPageSize).reverse();
  return { peerId, messages: rows.map((row): DmChatMessage => ({ id: row.id, handle: row.handle, body: row.body, postedAt: Number(row.posted_at), mine: row.sender_id === userId })) };
}
