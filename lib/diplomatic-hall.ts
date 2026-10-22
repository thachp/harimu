/** Diplomatic Hall proof of concept, slice 1 (#599; docs social-news-media §18.1 global channel, trade-diplomacy-sanctions §13.4): one channel shared by Kindle and Aurelle citizens.
 *  Reuses the square rules (1-280 plain-text characters, one post per 10 seconds, 20 per hour, 7-day expiry, the square handle, soft delete of your own post) in its own table, so the nation-scoped
 *  square (lib/square-chat.ts) is untouched. Korund and every other nation are closed out. Player-facing refusal lines come from the Diplomatic Hall copy module (#606). Import-free apart from types. */
import type { GameDatabase } from './database-contract';

/** The nations whose citizens may read and post. Korund citizens cannot see the global channel (docs §18.1); the hidden radio item and trade-delegate exceptions are out of scope. */
export const hallNations = ['kindle', 'aurelle'] as const;
export const hallOpenTo = (nationId: string | null | undefined): boolean => typeof nationId === 'string' && (hallNations as readonly string[]).includes(nationId);
export const hallExpirySeconds = 604800;
export const hallMessageMax = 280;
export const hallRead = 50;

export const hallSchema = [
  `CREATE TABLE IF NOT EXISTS diplomatic_hall_messages (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id), nation_id TEXT NOT NULL CHECK(nation_id IN ('kindle','aurelle')), body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 280), posted_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1)))`,
  `CREATE INDEX IF NOT EXISTS diplomatic_hall_messages_recent ON diplomatic_hall_messages(posted_at)`,
  `CREATE INDEX IF NOT EXISTS diplomatic_hall_messages_rate ON diplomatic_hall_messages(user_id, posted_at)`,
];

/** One conditional write: the poster must be a citizen of an open nation now, the id unused, and neither rate limit hit. The row keeps the poster's nation at post time. */
export const postHallSql = `INSERT INTO diplomatic_hall_messages(id,user_id,nation_id,body,posted_at)
SELECT ?, clerk_user_id, nation_id, ?, ? FROM citizens
WHERE clerk_user_id=? AND nation_id IN ('kindle','aurelle')
AND NOT EXISTS (SELECT 1 FROM diplomatic_hall_messages WHERE id=?)
AND NOT EXISTS (SELECT 1 FROM diplomatic_hall_messages WHERE user_id=? AND posted_at>?)
AND (SELECT COUNT(*) FROM diplomatic_hall_messages WHERE user_id=? AND posted_at>?)<20`;

export type HallMessage = { id: string; handle: string; nationId: string; body: string; postedAt: number; mine: boolean };

/** Read-only (GET stays read-only, #205): expired posts are filtered here and purged on the write path (purgeExpiredHall). */
export async function readHall(db: GameDatabase, userId: string, now: number): Promise<{ messages: HallMessage[] }> {
  const rows = await db.prepare(`SELECT m.id,h.handle,m.nation_id,m.body,m.posted_at,m.user_id FROM diplomatic_hall_messages m JOIN square_handles h ON h.user_id=m.user_id
    WHERE m.deleted=0 AND m.posted_at>? ORDER BY m.posted_at DESC,m.id DESC LIMIT ${hallRead}`).bind(now - hallExpirySeconds).all<{ id: string; handle: string; nation_id: string; body: string; posted_at: number; user_id: string }>();
  return { messages: rows.results.reverse().map(row => ({ id: row.id, handle: row.handle, nationId: row.nation_id, body: row.body, postedAt: Number(row.posted_at), mine: row.user_id === userId })) };
}
export const purgeExpiredHall = (db: GameDatabase, now: number) => db.prepare('DELETE FROM diplomatic_hall_messages WHERE posted_at<=?').bind(now - hallExpirySeconds).run();
