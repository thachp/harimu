/** #831: Kindle platform plank up-votes (docs §9.4 "human citizens join as members and up-vote platform planks the party AI must consider").
 *  Visibility only: no currency, no votes, no election effect. A vote counts only while the voter is still a member of that party. Migration 0077 mirrors plankVoteSchemas. */
import type { GameDatabase } from './database-contract';
import { pledgeCatalog, pledge, kindleParty } from './kindle-parties';
import { plankVotesPerMember } from './plank-votes-rules';
export * from './plank-votes-rules';
export const plankVoteSchemas = [
  `CREATE TABLE IF NOT EXISTS party_plank_votes (clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE, party_id TEXT NOT NULL, pledge_key TEXT NOT NULL, voted_at INTEGER NOT NULL, PRIMARY KEY (clerk_user_id, party_id, pledge_key))`,
];
export type PlankCommand = { action: 'upvote' | 'withdraw'; pledgeKey: string };
export type PlankView = { party: { id: string; name: string } | null; planks: { key: string; card: string; votes: number }[]; mine: string[]; max: number };
async function memberParty(db: GameDatabase, userId: string) {
  return (await db.prepare('SELECT party_id FROM party_members WHERE clerk_user_id=?').bind(userId).first<{ party_id: string }>())?.party_id ?? null;
}
export async function readPlanks(db: GameDatabase, userId: string): Promise<PlankView> {
  const partyId = await memberParty(db, userId), party = partyId ? kindleParty(partyId) : undefined;
  if (!partyId || !party) return { party: null, planks: [], mine: [], max: plankVotesPerMember };
  const counts = (await db.prepare(`SELECT v.pledge_key, COUNT(*) AS n FROM party_plank_votes v JOIN party_members m ON m.clerk_user_id=v.clerk_user_id AND m.party_id=v.party_id
    WHERE v.party_id=? GROUP BY v.pledge_key`).bind(partyId).all<{ pledge_key: string; n: number }>()).results ?? [];
  const byKey = new Map(counts.map(c => [c.pledge_key, Number(c.n)]));
  const mine = ((await db.prepare('SELECT pledge_key FROM party_plank_votes WHERE clerk_user_id=? AND party_id=? ORDER BY pledge_key').bind(userId, partyId).all<{ pledge_key: string }>()).results ?? []).map(r => r.pledge_key);
  const planks = pledgeCatalog.map((p, i) => ({ key: p.key, card: p.card, votes: byKey.get(p.key) ?? 0, i }))
    .sort((a, b) => b.votes - a.votes || a.i - b.i).map(({ key, card, votes }) => ({ key, card, votes }));
  return { party: { id: party.id, name: party.name }, planks, mine, max: plankVotesPerMember };
}
export async function runPlankCommand(db: GameDatabase, userId: string, cmd: PlankCommand, now: number): Promise<{ ok: true } | { ok: false; status: number; error: string; reason: string }> {
  if (!pledge(cmd.pledgeKey)) return { ok: false, status: 400, error: 'Unknown plank.', reason: 'bad_request' };
  const partyId = await memberParty(db, userId);
  if (!partyId) return { ok: false, status: 403, error: 'Join a party to up-vote its planks.', reason: 'not_member' };
  if (cmd.action === 'withdraw') {
    await db.prepare('DELETE FROM party_plank_votes WHERE clerk_user_id=? AND party_id=? AND pledge_key=?').bind(userId, partyId, cmd.pledgeKey).run();
    return { ok: true };
  }
  // One statement: membership and the cap are checked in the same INSERT, so two concurrent up-votes cannot pass a stale count.
  await db.prepare(`INSERT INTO party_plank_votes (clerk_user_id, party_id, pledge_key, voted_at)
    SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM party_members WHERE clerk_user_id=? AND party_id=?)
    AND (SELECT COUNT(*) FROM party_plank_votes WHERE clerk_user_id=? AND party_id=?) < ?
    ON CONFLICT (clerk_user_id, party_id, pledge_key) DO NOTHING`).bind(userId, partyId, cmd.pledgeKey, now, userId, partyId, userId, partyId, plankVotesPerMember).run();
  const has = await db.prepare('SELECT 1 AS x FROM party_plank_votes WHERE clerk_user_id=? AND party_id=? AND pledge_key=?').bind(userId, partyId, cmd.pledgeKey).first();
  return has ? { ok: true } : { ok: false, status: 409, error: `You can up-vote at most ${plankVotesPerMember} planks. Withdraw one first.`, reason: 'cap_reached' };
}
