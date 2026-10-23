/** #825 (docs §9.5 Integrity): Kindle vote-buying watch. "Transfer patterns within 48 hours of voting trigger an investigation event."
 *  The only human-to-human money movement in the game today is a player-market fill (buyer pays seller), so a fill whose seller voted in a Kindle election
 *  within the window (before or after the vote) is the "transfer" (sender = buyer, voter = seller). An event is recorded when the sender is a party member,
 *  a campaign actor (has a canvassing quest), or paid at least `ringVoters` distinct voters of the same election within the window.
 *  Events read only voter receipts (who voted, and when), never ballots, so an event can never say how anyone voted. No penalty (out of scope).
 *  Flag HARIMU_VOTE_BUYING_WATCH_ENABLED: "true" in preview, "false" in production. Off: no reads, no writes. */
import type { GameDatabase } from './database-contract';

export const voteBuyingWatchEnabled = (env: { HARIMU_VOTE_BUYING_WATCH_ENABLED?: string } | null | undefined) => env?.HARIMU_VOTE_BUYING_WATCH_ENABLED === 'true';
/** [ASSUMPTION] tuning values (config). The docs give only the 48 hours. */
export const voteBuyingWatch = Object.freeze({ windowSeconds: 48 * 3600, ringVoters: 3 });
export const voteBuyingReasons = ['party-member', 'campaign', 'ring'] as const;
export type VoteBuyingReason = (typeof voteBuyingReasons)[number];

export const voteBuyingEventsSchema = `CREATE TABLE IF NOT EXISTS vote_buying_events (
 election_key TEXT NOT NULL,
 voter_id TEXT NOT NULL,
 sender_id TEXT NOT NULL,
 transfer_id TEXT NOT NULL,
 reason TEXT NOT NULL CHECK(reason IN ('party-member','campaign','ring')),
 created_at INTEGER NOT NULL,
 PRIMARY KEY(election_key, voter_id, transfer_id, reason)
)`;

// Kindle voter receipts (who and when only). The civic table also holds other nations' elections, so it is joined to Kindle; Assembly and primaries are Kindle-only.
const receipts = `SELECT 'civic:'||r.election_id AS ekey, r.clerk_user_id AS uid, r.checked_at AS at FROM civic_voter_receipts r JOIN civic_elections e ON e.id=r.election_id AND e.nation_id='kindle' WHERE r.checked_at>?
 UNION ALL SELECT 'assembly:'||election_id, clerk_user_id, checked_at FROM assembly_voter_receipts WHERE checked_at>?
 UNION ALL SELECT 'primary:'||election_id, clerk_user_id, checked_at FROM primary_voter_receipts WHERE checked_at>?`;
/** One idempotent statement: every matching (vote, transfer, reason) not yet recorded. Re-running it adds nothing (primary key + ON CONFLICT DO NOTHING). */
// It starts with INSERT (the Postgres adapter only runs SELECT/INSERT/UPDATE/DELETE statements); the CTEs sit inside the INSERT's SELECT.
export const voteBuyingSweepSql = `INSERT INTO vote_buying_events (election_key, voter_id, sender_id, transfer_id, reason, created_at)
WITH r AS (${receipts}),
 hits AS (SELECT r.ekey, r.uid, r.at, f.buyer_id, f.request_id FROM r JOIN player_fills f ON f.seller_id=r.uid AND f.filled_at>=r.at-? AND f.filled_at<=r.at+?)
SELECT h.ekey, h.uid, h.buyer_id, h.request_id, x.reason, ? FROM hits h
 JOIN (SELECT 'party-member' AS reason UNION ALL SELECT 'campaign' UNION ALL SELECT 'ring') x ON
  (x.reason='party-member' AND EXISTS(SELECT 1 FROM party_members p WHERE p.clerk_user_id=h.buyer_id))
  OR (x.reason='campaign' AND EXISTS(SELECT 1 FROM canvass_quests q WHERE q.clerk_user_id=h.buyer_id))
  OR (x.reason='ring' AND (SELECT COUNT(DISTINCT h2.uid) FROM hits h2 WHERE h2.ekey=h.ekey AND h2.buyer_id=h.buyer_id)>=?)
ON CONFLICT DO NOTHING`;

/** Sweeps votes cast in the last 2 windows (so a transfer up to 48h after a vote is still caught). Call only with the flag on. */
export async function runVoteBuyingWatch(db: GameDatabase, now: number, config = voteBuyingWatch): Promise<void> {
  const since = now - 2 * config.windowSeconds;
  await db.prepare(voteBuyingSweepSql).bind(since, since, since, config.windowSeconds, config.windowSeconds, now, config.ringVoters).run();
}

export type VoteBuyingEvent = { electionKey: string; voterId: string; senderId: string; transferId: string; reason: VoteBuyingReason; createdAt: number };
/** Staff read (admin console), newest first. */
export async function listVoteBuyingEvents(db: GameDatabase, limit = 200): Promise<VoteBuyingEvent[]> {
  const rows = (await db.prepare('SELECT election_key, voter_id, sender_id, transfer_id, reason, created_at FROM vote_buying_events ORDER BY created_at DESC, election_key, voter_id, transfer_id, reason LIMIT ?').bind(limit)
    .all<{ election_key: string; voter_id: string; sender_id: string; transfer_id: string; reason: VoteBuyingReason; created_at: number }>()).results ?? [];
  return rows.map(r => ({ electionKey: r.election_key, voterId: r.voter_id, senderId: r.sender_id, transferId: r.transfer_id, reason: r.reason, createdAt: Number(r.created_at) }));
}
