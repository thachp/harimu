/** #740 slice 1: voluntary Kindle voter-intent answers and one published poll per election per real day (migration 0073 mirrors pollingSchemas).
 *  Reads return only the caller's own answer and published aggregates, never another citizen's answer or who answered. */
import type { GameDatabase } from './database-contract';
import { drawSample, maximumSample, pollDay, pollSeed, tallyPoll, type PollResult } from './polling-rules';
import { electionId } from './elections';
export const pollingSchemas = [
  `CREATE TABLE IF NOT EXISTS kindle_poll_answers (election_id TEXT NOT NULL, clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE, candidate_id TEXT NOT NULL, answered_at INTEGER NOT NULL, request_id TEXT NOT NULL UNIQUE, PRIMARY KEY (election_id, clerk_user_id))`,
  `CREATE TABLE IF NOT EXISTS kindle_poll_snapshots (election_id TEXT NOT NULL, poll_day INTEGER NOT NULL, n INTEGER NOT NULL CHECK(n >= 10), margin_tenths INTEGER NOT NULL, shares_json TEXT NOT NULL, published_at INTEGER NOT NULL, PRIMARY KEY (election_id, poll_day))`,
];
type Election = { id: string; slate: string[]; names: Record<string, string>; open: boolean };
async function readOpenElection(db: GameDatabase, now: number): Promise<Election | null> {
  const row = await db.prepare('SELECT id, candidates_json, opens_at, closes_at, closed_at FROM civic_elections WHERE id=?').bind(electionId).first<{ id: string; candidates_json: string; opens_at: number; closes_at: number; closed_at: number | null }>();
  if (!row) return null;
  const candidates = JSON.parse(row.candidates_json) as { id: string; name: string }[];
  return { id: row.id, slate: candidates.map(c => c.id), names: Object.fromEntries(candidates.map(c => [c.id, c.name])), open: row.closed_at == null && Number(row.opens_at) <= now && now < Number(row.closes_at) };
}
/** Publish today's snapshot once (first read of the real day): a seeded sample of the answers given before the day began. Under the minimum, nothing is stored. */
export async function publishDailyPoll(db: GameDatabase, election: Election, now: number) {
  const day = pollDay(now), dayStart = day * 86400;
  if (await db.prepare('SELECT 1 AS x FROM kindle_poll_snapshots WHERE election_id=? AND poll_day=?').bind(election.id, day).first()) return;
  const { results } = await db.prepare('SELECT candidate_id FROM kindle_poll_answers WHERE election_id=? AND answered_at<? ORDER BY clerk_user_id').bind(election.id, dayStart).all<{ candidate_id: string }>();
  const poll = tallyPoll(drawSample((results ?? []).map(r => r.candidate_id), maximumSample, pollSeed(election.id, day)), election.slate);
  if (poll) await db.prepare('INSERT INTO kindle_poll_snapshots (election_id, poll_day, n, margin_tenths, shares_json, published_at) VALUES (?,?,?,?,?,?) ON CONFLICT (election_id, poll_day) DO NOTHING').bind(election.id, day, poll.n, Math.round(poll.margin * 10), JSON.stringify(poll.shares), now).run();
}
export type PollView = { open: boolean; candidates: { id: string; name: string }[]; myAnswer: string | null; poll: (Omit<PollResult, 'shares'> & { day: number; publishedAt: number; shares: { candidateId: string; name: string; share: number }[] }) | null };
export async function readPolling(db: GameDatabase, userId: string, now: number): Promise<PollView | null> {
  const election = await readOpenElection(db, now);
  if (!election) return null;
  await publishDailyPoll(db, election, now);
  const latest = await db.prepare('SELECT poll_day, n, margin_tenths, shares_json, published_at FROM kindle_poll_snapshots WHERE election_id=? ORDER BY poll_day DESC LIMIT 1').bind(election.id).first<{ poll_day: number; n: number; margin_tenths: number; shares_json: string; published_at: number }>();
  const mine = await db.prepare('SELECT candidate_id FROM kindle_poll_answers WHERE election_id=? AND clerk_user_id=?').bind(election.id, userId).first<{ candidate_id: string }>();
  return {
    open: election.open, candidates: election.slate.map(id => ({ id, name: election.names[id] })), myAnswer: mine?.candidate_id ?? null,
    poll: latest ? { day: Number(latest.poll_day), n: Number(latest.n), margin: Number(latest.margin_tenths) / 10, publishedAt: Number(latest.published_at), shares: (JSON.parse(latest.shares_json) as { candidateId: string; share: number }[]).map(s => ({ ...s, name: election.names[s.candidateId] })) } : null,
  };
}
export type PollCommand = { action: 'answer'; candidateId: string; requestId: string } | { action: 'decline' };
export async function runPollCommand(db: GameDatabase, userId: string, cmd: PollCommand, now: number): Promise<{ ok: true } | { ok: false; status: 403 | 409 | 400; error: string; reason: string }> {
  const election = await readOpenElection(db, now);
  if (!election?.open) return { ok: false, status: 409, error: 'There is no open election to poll.', reason: 'closed' };
  if (cmd.action === 'decline') { await db.prepare('DELETE FROM kindle_poll_answers WHERE election_id=? AND clerk_user_id=?').bind(election.id, userId).run(); return { ok: true }; }
  if (!election.slate.includes(cmd.candidateId)) return { ok: false, status: 400, error: 'Choose one of the candidates.', reason: 'bad_candidate' };
  const used = await db.prepare('SELECT clerk_user_id FROM kindle_poll_answers WHERE request_id=?').bind(cmd.requestId).first<{ clerk_user_id: string }>();
  if (used) return used.clerk_user_id === userId ? { ok: true } : { ok: false, status: 409, error: 'That request identifier was already used.', reason: 'request_conflict' };
  await db.prepare(`INSERT INTO kindle_poll_answers (election_id, clerk_user_id, candidate_id, answered_at, request_id) VALUES (?,?,?,?,?)
    ON CONFLICT (election_id, clerk_user_id) DO UPDATE SET candidate_id=excluded.candidate_id, answered_at=excluded.answered_at, request_id=excluded.request_id`).bind(election.id, userId, cmd.candidateId, now, cmd.requestId).run();
  return { ok: true };
}
