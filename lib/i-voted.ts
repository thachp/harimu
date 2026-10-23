/** #782: Kindle cosmetic "I Voted" badge (docs §9.3 "Turnout incentives: a cosmetic 'I Voted' badge and Civic Rank XP, never currency").
 *  [ASSUMPTION] Derived on read from the voter receipts, so there is no migration: a badge exists exactly when a receipt with ballot_written=1 exists.
 *  One per citizen per election by construction (receipt PKs are (election_id, clerk_user_id)), and replays cannot duplicate it.
 *  Reads receipts only (election id + checked_at), never a ballot table, so lib/ballot-privacy.ts separation is untouched. No currency, no wallet.
 *  TODO(#741): Civic Rank XP for voting is out of scope here; civic rank already counts written ballots as civic acts. */
import type { GameDatabase } from './database-contract';
export type VoteKind = 'civic' | 'poc' | 'primary';
export type IVotedBadge = { kind: VoteKind; electionId: string; votedAt: number };
export const iVotedFlagOn = (env: unknown) => (env as { HARIMU_I_VOTED_BADGE_ENABLED?: string } | null)?.HARIMU_I_VOTED_BADGE_ENABLED === 'true';
/** [ASSUMPTION] Labels per election kind; the docs only name the badge. */
export const voteKindLabels: Readonly<Record<VoteKind, string>> = { civic: 'the Kindle general election', poc: 'the Kindle preview election', primary: 'a Kindle party primary' };
export const iVotedSql = `SELECT 'civic' AS kind, election_id, checked_at FROM civic_voter_receipts WHERE clerk_user_id=? AND ballot_written=1
 UNION ALL SELECT 'poc' AS kind, election_id, checked_at FROM poc_voter_receipts WHERE clerk_user_id=? AND ballot_written=1
 UNION ALL SELECT 'primary' AS kind, election_id, checked_at FROM primary_voter_receipts WHERE clerk_user_id=? AND ballot_written=1
 ORDER BY checked_at DESC, election_id
 LIMIT 1`; // #813: the card shows only the newest badge, so the read never grows with the number of elections
/** The newest badge only (LIMIT 1, #813): at most one row, however many elections the citizen voted in. */
export async function readIVoted(db: GameDatabase, userId: string): Promise<IVotedBadge[]> {
  const { results } = await db.prepare(iVotedSql).bind(userId, userId, userId).all<{ kind: VoteKind; election_id: string; checked_at: number }>();
  return (results ?? []).map(r => ({ kind: r.kind, electionId: r.election_id, votedAt: Number(r.checked_at) }));
}
