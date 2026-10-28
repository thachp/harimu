/** #882: embassy chat between two nations in the Diplomatic Hall (docs §27 embassy chat). One channel per unordered pair of live
 *  nations (kindle|korund, kindle|aurelle, aurelle|korund), on the lib/dm-chat.ts / lib/global-chat.ts pattern: 1-280 plain characters,
 *  10 s between posts, 20 per hour, 7-day retention, own-post delete, the shared square handle, each post labeled with its author's
 *  nation, and the #790 operator shadow-mute. Citizens of either nation in the pair may read and post; other nations cannot.
 *  Flag HARIMU_EMBASSY_CHAT_ENABLED (off in production). No UI this slice. */
import type { GameDatabase } from './database-contract';
import { isShadowMuted, type MuteWindow } from './chat-shadow-mute';

/** MVP live nations (lib/nation-discovery liveNations). Embassy pairs are among these only. */
export const embassyNations = ['kindle', 'korund', 'aurelle'] as const;
export type EmbassyNation = typeof embassyNations[number];
export const isEmbassyNation = (id: unknown): id is EmbassyNation =>
  typeof id === 'string' && (embassyNations as readonly string[]).includes(id);

export const embassyChatSchemas = [
  `CREATE TABLE IF NOT EXISTS embassy_chat_messages (id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id), nation_id TEXT NOT NULL, body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 280), posted_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS embassy_chat_messages_feed ON embassy_chat_messages(channel_id, posted_at)`,
  `CREATE INDEX IF NOT EXISTS embassy_chat_messages_rate ON embassy_chat_messages(user_id, posted_at)`,
];
export const embassyChatFlagOn = (b: unknown) => (b as { HARIMU_EMBASSY_CHAT_ENABLED?: string })?.HARIMU_EMBASSY_CHAT_ENABLED === 'true';
export const embassyChatRetentionSeconds = 604800, embassyChatGapSeconds = 10, embassyChatHourlyLimit = 20, embassyChatPageSize = 50;
/** Stable channel key for a nation pair (order-independent). */
export const embassyChannelId = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Inserts only when the poster is enrolled in one side of the channel and the peer nation is the other live nation. Nation never from the client. */
export const postEmbassyChatSql = `INSERT INTO embassy_chat_messages(id,channel_id,user_id,nation_id,body,posted_at)
SELECT ?, ?, clerk_user_id, nation_id, ?, ? FROM citizens
WHERE clerk_user_id=? AND nation_id=?
AND NOT EXISTS (SELECT 1 FROM embassy_chat_messages WHERE id=?)
AND NOT EXISTS (SELECT 1 FROM embassy_chat_messages WHERE user_id=? AND posted_at>?)
AND (SELECT COUNT(*) FROM embassy_chat_messages WHERE user_id=? AND posted_at>?)<${embassyChatHourlyLimit}`;
export const postEmbassyChatBinds = (id: string, channelId: string, text: string, now: number, userId: string, nationId: string) =>
  [id, channelId, text, now, userId, nationId, id, userId, now - embassyChatGapSeconds, userId, now - 3600];

export type EmbassyChatMessage = { id: string; handle: string; nationId: string; body: string; postedAt: number; mine: boolean };
/** Last 50 messages in the embassy channel with peerNation (oldest first). Shadow-muted posts inside their windows show only to that author. */
export async function readEmbassyChat(db: GameDatabase, userId: string, nationId: string, peerNation: string, now: number, muted: ReadonlyMap<string, readonly MuteWindow[]> = new Map()) {
  await db.prepare('DELETE FROM embassy_chat_messages WHERE posted_at<=?').bind(now - embassyChatRetentionSeconds).run();
  const channelId = embassyChannelId(nationId, peerNation);
  type Row = { id: string; user_id: string; handle: string; nation_id: string; body: string; posted_at: number };
  const rows = (await db.prepare(`SELECT m.id,m.user_id,h.handle,m.nation_id,m.body,m.posted_at FROM embassy_chat_messages m JOIN square_handles h ON h.user_id=m.user_id
    WHERE m.channel_id=? AND m.deleted=0 AND m.posted_at>? ORDER BY m.posted_at DESC,m.id DESC LIMIT 200`).bind(channelId, now - embassyChatRetentionSeconds).all<Row>()).results
    .filter(row => row.user_id === userId || !isShadowMuted(muted, row.user_id, Number(row.posted_at))).slice(0, embassyChatPageSize).reverse();
  return { peerNation, channelId, messages: rows.map((row): EmbassyChatMessage => ({ id: row.id, handle: row.handle, nationId: row.nation_id, body: row.body, postedAt: Number(row.posted_at), mine: row.user_id === userId })) };
}
