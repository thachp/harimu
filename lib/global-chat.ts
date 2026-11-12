/** #881 (part 2): the global chat channel (docs §27 MVP chat: city, global, DMs). One channel for every enrolled citizen of every nation, on the
 *  lib/city-chat.ts pattern: 1-280 plain characters, 10 s between posts, 20 per hour, 7-day retention, own-post delete, the shared square handle,
 *  each post labeled with its author's nation, and the #790 operator shadow-mute. Not location-bound, so travel does not block it.
 *  Flag HARIMU_GLOBAL_CHAT_ENABLED (off in production). DMs follow. */
import type { GameDatabase } from './database-contract';
import { isShadowMuted, type MuteWindow } from './chat-shadow-mute';
import type { VarkandAlert } from './home-move';

export const globalChatSchemas = [
  `CREATE TABLE IF NOT EXISTS global_chat_messages (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id), nation_id TEXT NOT NULL, body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 280), posted_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS global_chat_messages_feed ON global_chat_messages(posted_at)`,
  `CREATE INDEX IF NOT EXISTS global_chat_messages_rate ON global_chat_messages(user_id, posted_at)`,
];
export const globalChatFlagOn = (b: unknown) => (b as { HARIMU_GLOBAL_CHAT_ENABLED?: string })?.HARIMU_GLOBAL_CHAT_ENABLED === 'true';
export const globalChatRetentionSeconds = 604800, globalChatGapSeconds = 10, globalChatHourlyLimit = 20, globalChatPageSize = 50;

/** #1354 (docs §18.1 Global channel): Korund citizens cannot see the global channel and Varkand citizens lose it at Red Alert. The hidden radio item and
 *  trade-delegate exceptions are out of scope, as in lib/diplomatic-hall.ts. Wording follows the neutral Diplomatic Hall refusals (#600). */
export const globalChatRefusals = {
  nation_closed: 'The global channel is closed to your nation.',
  alert_closed: 'The global channel is closed to your nation during a Red Alert.',
} as const;
export type GlobalChatRefusal = keyof typeof globalChatRefusals;
/** Why this nation cannot use the channel now, or null. `alert` is Varkand's stored level (Green when HARIMU_VARKAND_ALERT_ENABLED is off). */
export function globalChatClosedFor(nationId: string, alert: VarkandAlert = 'green'): GlobalChatRefusal | null {
  if (nationId === 'korund') return 'nation_closed';
  if (nationId === 'varkand' && alert === 'red') return 'alert_closed';
  return null;
}

/** Inserts only for an enrolled citizen (nation taken from the citizens row, never the client), inside the rate limits. 0 changes: replay, limit or unenrolled.
 *  #1354: a Korund author is refused in the insert too, so a nation change between the route check and the write cannot slip a post in.
 *  #1360: when HARIMU_VARKAND_ALERT_ENABLED is on, a Varkand author is also refused if the stored Alert Level is Red, so a mid-request raise to Red cannot slip a post in.
 *  Flag off: the SQL is unchanged and does not mention the alert table. */
const postGlobalChatSelect = (alertGuard: string) => `INSERT INTO global_chat_messages(id,user_id,nation_id,body,posted_at)
SELECT ?, clerk_user_id, nation_id, ?, ? FROM citizens WHERE clerk_user_id=? AND nation_id IS NOT NULL AND nation_id<>'korund'${alertGuard}
AND NOT EXISTS (SELECT 1 FROM global_chat_messages WHERE id=?)
AND NOT EXISTS (SELECT 1 FROM global_chat_messages WHERE user_id=? AND posted_at>?)
AND (SELECT COUNT(*) FROM global_chat_messages WHERE user_id=? AND posted_at>?)<${globalChatHourlyLimit}`;
export const postGlobalChatSql = postGlobalChatSelect('');
/** Flag-on INSERT also refuses Varkand while the stored level is Red. Flag off returns `postGlobalChatSql`. */
export const postGlobalChatSqlFor = (alertEnabled: boolean) => alertEnabled
  ? postGlobalChatSelect(`
AND NOT (nation_id='varkand' AND EXISTS (SELECT 1 FROM varkand_alert_levels WHERE id=1 AND level='red'))`)
  : postGlobalChatSql;
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
