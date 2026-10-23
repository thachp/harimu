/** #740 slice 1: voluntary Kindle voter-intent answers and one published poll per election per real day (migration 0074 mirrors pollingSchemas).
 *  Reads return only the caller's own answer and published aggregates, never another citizen's answer or who answered. */
import type { GameDatabase } from './database-contract';
import { drawSample, maximumSample, minimumNewAnswers, pollDay, pollSeed, tallyPoll } from './polling-rules';
import { electionId } from './elections';
export const pollingSchemas = [
  `CREATE TABLE IF NOT EXISTS kindle_poll_answers (election_id TEXT NOT NULL, clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE, candidate_id TEXT NOT NULL, answered_at INTEGER NOT NULL, request_id TEXT NOT NULL UNIQUE, PRIMARY KEY (election_id, clerk_user_id))`,
  `CREATE TABLE IF NOT EXISTS kindle_poll_snapshots (election_id TEXT NOT NULL, poll_day INTEGER NOT NULL, n INTEGER NOT NULL CHECK(n >= 10), margin_tenths INTEGER NOT NULL, shares_json TEXT NOT NULL, published_at INTEGER NOT NULL, PRIMARY KEY (election_id, poll_day))`,
  // ARC ruling on #803: a choice-free "has answered" marker, one row per citizen per election; a skip keeps it, so skip-and-re-answer is never a new respondent.
  `CREATE TABLE IF NOT EXISTS kindle_poll_respondents (election_id TEXT NOT NULL, clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE, first_answered_at INTEGER NOT NULL, PRIMARY KEY (election_id, clerk_user_id))`,
  `CREATE TABLE IF NOT EXISTS kindle_poll_requests (request_id TEXT PRIMARY KEY, clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE, election_id TEXT NOT NULL, answered_at INTEGER NOT NULL)`,
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
  // ARC rulings (b) and on #803: count NEW respondents only: current answerers whose choice-free marker (kindle_poll_respondents.first_answered_at) falls in
  // [last cut-off, today's start). A changed answer, or a skip and re-answer, keeps the marker's first time and never counts again. Under minimumNewAnswers the previous snapshot is served.
  const last = await db.prepare('SELECT MAX(poll_day) AS d FROM kindle_poll_snapshots WHERE election_id=?').bind(election.id).first<{ d: number | null }>();
  if (last?.d != null) {
    const added = await db.prepare('SELECT COUNT(*) AS c FROM kindle_poll_answers a JOIN kindle_poll_respondents m ON m.election_id=a.election_id AND m.clerk_user_id=a.clerk_user_id WHERE a.election_id=? AND m.first_answered_at>=? AND m.first_answered_at<?').bind(election.id, Number(last.d) * 86400, dayStart).first<{ c: number }>();
    if (Number(added?.c ?? 0) < minimumNewAnswers) return;
  }
  const { results } = await db.prepare('SELECT candidate_id FROM kindle_poll_answers WHERE election_id=? AND answered_at<? ORDER BY clerk_user_id').bind(election.id, dayStart).all<{ candidate_id: string }>();
  const poll = tallyPoll(drawSample((results ?? []).map(r => r.candidate_id), maximumSample, pollSeed(election.id, day)), election.slate);
  if (poll) await db.prepare('INSERT INTO kindle_poll_snapshots (election_id, poll_day, n, margin_tenths, shares_json, published_at) VALUES (?,?,?,?,?,?) ON CONFLICT (election_id, poll_day) DO NOTHING').bind(election.id, day, poll.n, Math.round(poll.margin * 10), JSON.stringify(poll.shares), now).run();
}
export type PollView = { open: boolean; candidates: { id: string; name: string }[]; myAnswer: string | null; poll: { day: number; marginBand: number; publishedAt: number; shares: { candidateId: string; name: string; share: number }[] } | null };
export async function readPolling(db: GameDatabase, userId: string, now: number): Promise<PollView | null> {
  const election = await readOpenElection(db, now);
  if (!election) return null;
  await publishDailyPoll(db, election, now);
  const latest = await db.prepare('SELECT poll_day, margin_tenths, shares_json, published_at FROM kindle_poll_snapshots WHERE election_id=? ORDER BY poll_day DESC LIMIT 1').bind(election.id).first<{ poll_day: number; margin_tenths: number; shares_json: string; published_at: number }>();
  const mine = await db.prepare('SELECT candidate_id FROM kindle_poll_answers WHERE election_id=? AND clerk_user_id=?').bind(election.id, userId).first<{ candidate_id: string }>();
  return {
    open: election.open, candidates: election.slate.map(id => ({ id, name: election.names[id] })), myAnswer: mine?.candidate_id ?? null,
    poll: latest ? { day: Number(latest.poll_day), marginBand: Number(latest.margin_tenths) / 10, publishedAt: Number(latest.published_at), shares: (JSON.parse(latest.shares_json) as { candidateId: string; share: number }[]).map(s => ({ candidateId: s.candidateId, name: election.names[s.candidateId], share: s.share })) } : null,
  };
}
export type PollCommand = { action: 'answer'; candidateId: string; requestId: string } | { action: 'decline' };
export async function runPollCommand(db: GameDatabase, userId: string, cmd: PollCommand, now: number): Promise<{ ok: true } | { ok: false; status: 403 | 409 | 400; error: string; reason: string }> {
  const election = await readOpenElection(db, now);
  if (!election?.open) return { ok: false, status: 409, error: 'There is no open election to poll.', reason: 'closed' };
  // QA3: a skip leaves no trace of the citizen's choice: the answer and its request log go together. The choice-free respondent marker stays (ARC ruling).
  if (cmd.action === 'decline') { await db.batch([db.prepare('DELETE FROM kindle_poll_answers WHERE election_id=? AND clerk_user_id=?').bind(election.id, userId), db.prepare('DELETE FROM kindle_poll_requests WHERE election_id=? AND clerk_user_id=?').bind(election.id, userId)]); return { ok: true }; }
  if (!election.slate.includes(cmd.candidateId)) return { ok: false, status: 400, error: 'Choose one of the candidates.', reason: 'bad_candidate' };
  // Every answer request id is kept, so replaying an older one after a change returns the stored result and never re-applies the old answer.
  const used = await db.prepare('SELECT clerk_user_id FROM kindle_poll_requests WHERE request_id=?').bind(cmd.requestId).first<{ clerk_user_id: string }>();
  if (used) return used.clerk_user_id === userId ? { ok: true } : { ok: false, status: 409, error: 'That request identifier was already used.', reason: 'request_conflict' };
  // One batch: the request log (no candidate stored) and the answer. A concurrent duplicate of the same id finds the answer already written by that id and applies nothing.
  await db.batch([
    db.prepare('INSERT INTO kindle_poll_requests (request_id, clerk_user_id, election_id, answered_at) VALUES (?,?,?,?) ON CONFLICT (request_id) DO NOTHING').bind(cmd.requestId, userId, election.id, now),
    db.prepare('INSERT INTO kindle_poll_respondents (election_id, clerk_user_id, first_answered_at) VALUES (?,?,?) ON CONFLICT (election_id, clerk_user_id) DO NOTHING').bind(election.id, userId, now),
    db.prepare(`INSERT INTO kindle_poll_answers (election_id, clerk_user_id, candidate_id, answered_at, request_id)
      SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM kindle_poll_requests WHERE request_id=? AND clerk_user_id=?) AND NOT EXISTS (SELECT 1 FROM kindle_poll_answers WHERE request_id=?)
      ON CONFLICT (election_id, clerk_user_id) DO UPDATE SET candidate_id=excluded.candidate_id, answered_at=excluded.answered_at, request_id=excluded.request_id`).bind(election.id, userId, cmd.candidateId, now, cmd.requestId, cmd.requestId, userId, cmd.requestId),
  ]);
  const owner = await db.prepare('SELECT clerk_user_id FROM kindle_poll_requests WHERE request_id=?').bind(cmd.requestId).first<{ clerk_user_id: string }>();
  if (owner?.clerk_user_id !== userId) return { ok: false, status: 409, error: 'That request identifier was already used.', reason: 'request_conflict' };
  return { ok: true };
}
