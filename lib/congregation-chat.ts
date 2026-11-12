/** #1342: congregation channel (docs 14.4 "a private channel", 18.1 congregation & faith channels). One channel per joinable congregation, on the
 *  lib/city-chat.ts pattern: only a current member (lib/congregations currentCongregation, server-derived) reads and posts, 1-280 plain characters,
 *  10 s between posts, 20 per hour, 7-day retention, own-post delete, the shared square handle and the #790 operator shadow-mute. Korund public
 *  congregations are unjoinable, so they have no channel. Flag HARIMU_CONGREGATION_CHAT_ENABLED (off in production). No UI this slice. */
import type { GameDatabase } from './database-contract';
import { isShadowMuted, type MuteWindow } from './chat-shadow-mute';

export const congregationChatSchemas = [
  `CREATE TABLE IF NOT EXISTS congregation_messages (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id), congregation_id TEXT NOT NULL, body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 280), posted_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS congregation_messages_feed ON congregation_messages(congregation_id, posted_at)`,
  `CREATE INDEX IF NOT EXISTS congregation_messages_rate ON congregation_messages(user_id, posted_at)`,
];
export const congregationChatFlagOn = (b: unknown) => (b as { HARIMU_CONGREGATION_CHAT_ENABLED?: string })?.HARIMU_CONGREGATION_CHAT_ENABLED === 'true';
export const congregationChatRetentionSeconds = 604800, congregationChatGapSeconds = 10, congregationChatHourlyLimit = 20, congregationChatPageSize = 50;

/** Inserts only while the poster still holds a membership row in that congregation, inside the rate limits. 0 changes: replay, limit or a membership that just ended. */
export const postCongregationChatSql = `INSERT INTO congregation_messages(id,user_id,congregation_id,body,posted_at)
SELECT ?, m.user_id, m.congregation_id, ?, ? FROM congregation_members m WHERE m.user_id=? AND m.congregation_id=?
AND NOT EXISTS (SELECT 1 FROM congregation_messages WHERE id=?)
AND NOT EXISTS (SELECT 1 FROM congregation_messages WHERE user_id=? AND posted_at>?)
AND (SELECT COUNT(*) FROM congregation_messages WHERE user_id=? AND posted_at>?)<${congregationChatHourlyLimit}`;
export const postCongregationChatBinds = (id: string, text: string, now: number, userId: string, congregationId: string) =>
  [id, text, now, userId, congregationId, id, userId, now - congregationChatGapSeconds, userId, now - 3600];

export type CongregationChatMessage = { id: string; handle: string; body: string; postedAt: number; mine: boolean };
/** The congregation's last 50 messages (oldest first). Callers pass only the viewer's current congregation. Shadow-muted posts show only to their author. */
export async function readCongregationChat(db: GameDatabase, userId: string, congregationId: string, now: number, muted: ReadonlyMap<string, readonly MuteWindow[]> = new Map()) {
  await db.prepare('DELETE FROM congregation_messages WHERE posted_at<=?').bind(now - congregationChatRetentionSeconds).run();
  type Row = { id: string; user_id: string; handle: string; body: string; posted_at: number };
  const rows = (await db.prepare(`SELECT m.id,m.user_id,h.handle,m.body,m.posted_at FROM congregation_messages m JOIN square_handles h ON h.user_id=m.user_id
    WHERE m.congregation_id=? AND m.deleted=0 AND m.posted_at>? AND EXISTS (SELECT 1 FROM congregation_members WHERE user_id=? AND congregation_id=?)
    ORDER BY m.posted_at DESC,m.id DESC LIMIT 200`).bind(congregationId, now - congregationChatRetentionSeconds, userId, congregationId).all<Row>()).results
    .filter(row => row.user_id === userId || !isShadowMuted(muted, row.user_id, Number(row.posted_at))).slice(0, congregationChatPageSize).reverse();
  return { congregationId, messages: rows.map((row): CongregationChatMessage => ({ id: row.id, handle: row.handle, body: row.body, postedAt: Number(row.posted_at), mine: row.user_id === userId })) };
}
