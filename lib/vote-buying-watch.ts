/** #825 (docs §9.5 Integrity): Kindle vote-buying watch. "Transfer patterns within 48 hours of voting trigger an investigation event."
 *  ARC (QA2 change request on #834): only DIRECT transfers or gifts (non-market value moves) count, never a market purchase at the listed price. An event is recorded
 *  when the sender is a party member or a canvasser (campaign actor) and the recipient voted in a Kindle election within 48 hours (before or after) of the transfer.
 *  Kindle has no citizen-to-citizen transfer or gift yet, so `directTransferSources` is empty and the watch reads nothing; each future transfer or gift feature
 *  adds its table here (an id, sender, recipient and unix time). Events read only voter receipts (who voted, and when), never ballots. No penalty (out of scope).
 *  Flag HARIMU_VOTE_BUYING_WATCH_ENABLED: "true" in preview, "false" in production. Off: no reads, no writes. */
import type { GameDatabase } from './database-contract';

export const voteBuyingWatchEnabled = (env: { HARIMU_VOTE_BUYING_WATCH_ENABLED?: string } | null | undefined) => env?.HARIMU_VOTE_BUYING_WATCH_ENABLED === 'true';
/** [ASSUMPTION] tuning values (config). The docs give only the 48 hours. */
export const voteBuyingWatch = Object.freeze({ windowSeconds: 48 * 3600 });
export const voteBuyingReasons = ['party-member', 'campaign'] as const;
export type VoteBuyingReason = (typeof voteBuyingReasons)[number];

export const voteBuyingEventsSchema = `CREATE TABLE IF NOT EXISTS vote_buying_events (
 election_key TEXT NOT NULL,
 voter_id TEXT NOT NULL,
 sender_id TEXT NOT NULL,
 transfer_id TEXT NOT NULL,
 reason TEXT NOT NULL CHECK(reason IN ('party-member','campaign')),
 created_at INTEGER NOT NULL,
 PRIMARY KEY(election_key, voter_id, transfer_id, reason)
)`;

// Kindle voter receipts (who and when only). The civic table also holds other nations' elections, so it is joined to Kindle; Assembly and primaries are Kindle-only.
const receipts = `SELECT 'civic:'||r.election_id AS ekey, r.clerk_user_id AS uid, r.checked_at AS at FROM civic_voter_receipts r JOIN civic_elections e ON e.id=r.election_id AND e.nation_id='kindle' WHERE r.checked_at>?
 UNION ALL SELECT 'assembly:'||election_id, clerk_user_id, checked_at FROM assembly_voter_receipts WHERE checked_at>?
 UNION ALL SELECT 'primary:'||election_id, clerk_user_id, checked_at FROM primary_voter_receipts WHERE checked_at>?`;
/** A non-market value move between citizens: `sql` selects (id, sender, recipient, at) columns named exactly that. Player-market fills are deliberately not a source. */
export type DirectTransferSource = { name: string; sql: string };
export const directTransferSources: readonly DirectTransferSource[] = []; // none in Kindle yet (no gift or transfer feature)

/** One idempotent statement: every matching (vote, transfer, reason) not yet recorded. It starts with INSERT (the Postgres adapter runs only SELECT/INSERT/UPDATE/DELETE);
 *  re-running adds nothing (primary key + ON CONFLICT DO NOTHING). */
// SECURITY: `sources` (each name and sql) is interpolated into the SQL text, not bound. It must stay a code-constant list (directTransferSources)
// and must never come from user, request, env or config input.
export const voteBuyingSweepSql = (sources: readonly DirectTransferSource[]) => `INSERT INTO vote_buying_events (election_key, voter_id, sender_id, transfer_id, reason, created_at)
WITH r AS (${receipts}), t AS (${sources.map(x => `SELECT '${x.name}:'||id AS id, sender, recipient, at FROM (${x.sql}) s`).join(' UNION ALL ')}),
 hits AS (SELECT r.ekey, r.uid, t.sender, t.id FROM r JOIN t ON t.recipient=r.uid AND t.sender<>r.uid AND t.at>=r.at-? AND t.at<=r.at+?)
SELECT h.ekey, h.uid, h.sender, h.id, x.reason, ? FROM hits h
 JOIN (SELECT 'party-member' AS reason UNION ALL SELECT 'campaign') x ON
  (x.reason='party-member' AND EXISTS(SELECT 1 FROM party_members p WHERE p.clerk_user_id=h.sender))
  OR (x.reason='campaign' AND EXISTS(SELECT 1 FROM canvass_quests q WHERE q.clerk_user_id=h.sender))
ON CONFLICT DO NOTHING`;

/** Sweeps votes cast in the last 2 windows (so a transfer up to 48h after a vote is still caught). Call only with the flag on. No sources: no query at all. */
export async function runVoteBuyingWatch(db: GameDatabase, now: number, sources: readonly DirectTransferSource[] = directTransferSources, config = voteBuyingWatch): Promise<void> {
  if (!sources.length) return;
  const since = now - 2 * config.windowSeconds;
  await db.prepare(voteBuyingSweepSql(sources)).bind(since, since, since, config.windowSeconds, config.windowSeconds, now).run();
}

export type VoteBuyingEvent = { electionKey: string; voterId: string; senderId: string; transferId: string; reason: VoteBuyingReason; createdAt: number };
/** Staff read (admin console), newest first. */
export async function listVoteBuyingEvents(db: GameDatabase, limit = 200): Promise<VoteBuyingEvent[]> {
  const rows = (await db.prepare('SELECT election_key, voter_id, sender_id, transfer_id, reason, created_at FROM vote_buying_events ORDER BY created_at DESC, election_key, voter_id, transfer_id, reason LIMIT ?').bind(limit)
    .all<{ election_key: string; voter_id: string; sender_id: string; transfer_id: string; reason: VoteBuyingReason; created_at: number }>()).results ?? [];
  return rows.map(r => ({ electionKey: r.election_key, voterId: r.voter_id, senderId: r.sender_id, transferId: r.transfer_id, reason: r.reason, createdAt: Number(r.created_at) }));
}
