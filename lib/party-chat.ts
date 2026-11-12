/** #1353: party channel (docs 18.1 "Party / faction / house / order — Members — Private to members"). One channel per Kindle party (#307), on the
 *  lib/congregation-chat.ts pattern: only a citizen with a current party_members row for that party reads and posts, 1-280 plain characters,
 *  10 s between posts, 20 per hour, 7-day retention, own-post delete (even after leaving), the shared square handle and the #790 shadow-mute.
 *  Flag HARIMU_PARTY_CHAT_ENABLED (packed in HARIMU_GRAY_PACK, off in production); not gated by HARIMU_PRIMARIES_ENABLED. No UI this slice. */
import type { GameDatabase } from './database-contract';
import { flagOn } from './flag-pack.mjs';
import { isShadowMuted, type MuteWindow } from './chat-shadow-mute';
import { isPartyId } from './primaries-rules';

export const partyChatSchemas = [
  `CREATE TABLE IF NOT EXISTS party_messages (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id), party_id TEXT NOT NULL, body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 280), posted_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS party_messages_feed ON party_messages(party_id, posted_at)`,
  `CREATE INDEX IF NOT EXISTS party_messages_rate ON party_messages(user_id, posted_at)`,
];
export const partyChatFlagOn = (b: unknown) => flagOn(b, 'HARIMU_PARTY_CHAT_ENABLED'); // packed in HARIMU_GRAY_PACK; a direct string wins
export const partyChatRetentionSeconds = 604800, partyChatGapSeconds = 10, partyChatHourlyLimit = 20, partyChatPageSize = 50;

/** The Kindle party whose channel this citizen may use now (their party_members row), or null. */
export async function currentParty(db: GameDatabase, userId: string) {
  const row = await db.prepare('SELECT party_id FROM party_members WHERE clerk_user_id=?').bind(userId).first<{ party_id: string }>();
  return row && isPartyId(row.party_id) ? row.party_id : null;
}

/** Inserts only while the poster still holds that party's membership row, inside the rate limits. 0 changes: replay, limit or a membership that just ended. */
export const postPartyChatSql = `INSERT INTO party_messages(id,user_id,party_id,body,posted_at)
SELECT ?, m.clerk_user_id, m.party_id, ?, ? FROM party_members m WHERE m.clerk_user_id=? AND m.party_id=?
AND NOT EXISTS (SELECT 1 FROM party_messages WHERE id=?)
AND NOT EXISTS (SELECT 1 FROM party_messages WHERE user_id=? AND posted_at>?)
AND (SELECT COUNT(*) FROM party_messages WHERE user_id=? AND posted_at>?)<${partyChatHourlyLimit}`;
export const postPartyChatBinds = (id: string, text: string, now: number, userId: string, partyId: string) =>
  [id, text, now, userId, partyId, id, userId, now - partyChatGapSeconds, userId, now - 3600];

export type PartyChatMessage = { id: string; handle: string; body: string; postedAt: number; mine: boolean };
/** The party's last 50 messages (oldest first), only while the viewer is still a member. Shadow-muted posts show only to their author. */
export async function readPartyChat(db: GameDatabase, userId: string, partyId: string, now: number, muted: ReadonlyMap<string, readonly MuteWindow[]> = new Map()) {
  await db.prepare('DELETE FROM party_messages WHERE posted_at<=?').bind(now - partyChatRetentionSeconds).run();
  type Row = { id: string; user_id: string; handle: string; body: string; posted_at: number };
  const rows = (await db.prepare(`SELECT m.id,m.user_id,h.handle,m.body,m.posted_at FROM party_messages m JOIN square_handles h ON h.user_id=m.user_id
    WHERE m.party_id=? AND m.deleted=0 AND m.posted_at>? AND EXISTS (SELECT 1 FROM party_members WHERE clerk_user_id=? AND party_id=?)
    ORDER BY m.posted_at DESC,m.id DESC LIMIT 200`).bind(partyId, now - partyChatRetentionSeconds, userId, partyId).all<Row>()).results
    .filter(row => row.user_id === userId || !isShadowMuted(muted, row.user_id, Number(row.posted_at))).slice(0, partyChatPageSize).reverse();
  return { partyId, messages: rows.map((row): PartyChatMessage => ({ id: row.id, handle: row.handle, body: row.body, postedAt: Number(row.posted_at), mine: row.user_id === userId })) };
}
