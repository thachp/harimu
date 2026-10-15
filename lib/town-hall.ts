import type { GameDatabase } from './database-contract';
import { electionCandidates, electionId as campaignId } from './elections';
import { townHallCopy } from './campaign-copy';
import { debateHallCandidateId, rankQuestions, topQuestions, townHallStage, townHallWindowSeconds, validQuestionText, type TownHallStage } from './town-hall-rules';
export * from './town-hall-rules';

/** #441: Kindle town hall PoC behind HARIMU_TOWN_HALLS_ENABLED (default "false"). Flag off: the route answers 404 before auth and nothing is read or written.
 *  Rows are written only by POST (a hall row on the first question inside its window; a question; a vote) and by the scheduled Worker (`runTownHallCron` in lib/town-hall-ai.ts, the AI answers).
 *  GET writes nothing, not even the hall row, and no GET ever calls the AI. The AI answers are a second, separate flag (HARIMU_AI_TOWN_HALL_ANSWERS_ENABLED, default
 *  "false") that also needs the AI binding and a valid AI budget; without them a closed hall shows its selected questions as "no answer yet" and nothing fails. */
export type TownHallBindings = { HARIMU_TOWN_HALLS_ENABLED?: string; HARIMU_TOWN_HALL_OPEN_AT?: string; NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW?: string; HARIMU_ACCOUNT_ELECTION_POC_ENABLED?: string };
export const townHallsEnabled = (b: TownHallBindings) => b.HARIMU_TOWN_HALLS_ENABLED === 'true';
/** [ASSUMPTION] No real calendar here (#351 owns it): an operator sets HARIMU_TOWN_HALL_OPEN_AT (epoch seconds) and every candidate's town hall opens then for 24 hours. Unset or invalid: it never opens. */
export const epochSeconds = (raw: string | undefined): number | null => /^[1-9][0-9]{0,11}$/.test(raw ?? '') && Number.isSafeInteger(Number(raw)) ? Number(raw) : null;
export const townHallOpenAt = (b: TownHallBindings): number | null => epochSeconds(b.HARIMU_TOWN_HALL_OPEN_AT);
export const townHallIdFor = (candidateId: string) => `${campaignId}-town-hall-${candidateId}`;
const knownCandidate = (id: unknown): id is string => typeof id === 'string' && electionCandidates.some(c => c.id === id);
export const isTownHallCandidate = knownCandidate;

export const townHallSchemas = [
  `CREATE TABLE IF NOT EXISTS town_halls (
 id TEXT PRIMARY KEY,
 election_id TEXT NOT NULL,
 candidate_id TEXT NOT NULL,
 opens_at INTEGER NOT NULL,
 closes_at INTEGER NOT NULL,
 CHECK(closes_at = opens_at + 86400)
)`,
  `CREATE TABLE IF NOT EXISTS town_hall_questions (
 id TEXT PRIMARY KEY,
 hall_id TEXT NOT NULL REFERENCES town_halls(id),
 author_id TEXT NOT NULL REFERENCES citizens(clerk_user_id),
 request_id TEXT NOT NULL UNIQUE,
 body TEXT NOT NULL CHECK(length(body) BETWEEN 10 AND 200),
 created_at INTEGER NOT NULL,
 UNIQUE(hall_id, author_id)
)`,
  `CREATE TABLE IF NOT EXISTS town_hall_votes (
 question_id TEXT NOT NULL REFERENCES town_hall_questions(id),
 voter_id TEXT NOT NULL REFERENCES citizens(clerk_user_id),
 request_id TEXT NOT NULL UNIQUE,
 voted_at INTEGER NOT NULL,
 PRIMARY KEY(question_id, voter_id)
)`,
  `CREATE TABLE IF NOT EXISTS town_hall_answers (
 question_id TEXT PRIMARY KEY REFERENCES town_hall_questions(id),
 hall_id TEXT NOT NULL REFERENCES town_halls(id),
 answer_text TEXT NOT NULL CHECK(length(answer_text) BETWEEN 1 AND 600),
 answered_at INTEGER NOT NULL
)`,
  'CREATE INDEX IF NOT EXISTS idx_town_hall_questions_hall ON town_hall_questions(hall_id)',
  'CREATE INDEX IF NOT EXISTS idx_town_hall_votes_question ON town_hall_votes(question_id)',
];

export type TownHallQuestion = { id: string; text: string; votes: number; mine: boolean; voted: boolean; selected: boolean; answer: { text: string; ai: true; at: number } | null; answerStatus: 'none' | 'pending' | 'answered' };
export type TownHall = { id: string; candidateId: string; candidateName: string; platform: string; stage: TownHallStage; opensAt: number | null; closesAt: number | null; asked: boolean; questions: TownHallQuestion[] };
export type TownHallSnapshot = { enabled: true; electionId: string; halls: TownHall[]; ai: { disclosure: string; badge: true } };
type HallRow = { id: string; candidate_id: string; opens_at: number; closes_at: number };

type QuestionRow = { id: string; body: string; author_id: string; created_at: number; votes: number; mine_vote: number; answer_text: string | null; answered_at: number | null };
/** One hall's questions with their vote counts, the caller's own vote and (town halls only) the saved answer. Read-only; shared by the town halls and the #282 debate. */
export async function loadHallQuestions(db: GameDatabase, userId: string, hallId: string): Promise<QuestionRow[]> {
  return (await db.prepare(`SELECT q.id,q.body,q.author_id,q.created_at,(SELECT COUNT(*) FROM town_hall_votes v WHERE v.question_id=q.id) AS votes,
 (SELECT COUNT(*) FROM town_hall_votes v WHERE v.question_id=q.id AND v.voter_id=?) AS mine_vote,a.answer_text,a.answered_at
 FROM town_hall_questions q LEFT JOIN town_hall_answers a ON a.question_id=q.id WHERE q.hall_id=?`).bind(userId, hallId).all<QuestionRow>()).results;
}

/** Read-only. An unopened hall (no row yet) is projected from the configured open time; no row is created. */
export async function readTownHalls(db: GameDatabase, userId: string, now: number, openAt: number | null): Promise<TownHallSnapshot> {
  const rows = (await db.prepare('SELECT id,candidate_id,opens_at,closes_at FROM town_halls WHERE election_id=?').bind(campaignId).all<HallRow>()).results;
  const halls: TownHall[] = [];
  for (const candidate of electionCandidates) {
    const id = townHallIdFor(candidate.id), row = rows.find(r => r.id === id);
    const opensAt = row ? Number(row.opens_at) : openAt, closesAt = row ? Number(row.closes_at) : openAt === null ? null : openAt + townHallWindowSeconds;
    const stage = townHallStage(now, opensAt, closesAt);
    let questions: TownHallQuestion[] = [], asked = false;
    if (row) {
      const found = await loadHallQuestions(db, userId, id);
      const ranked = rankQuestions(found.map(q => ({ ...q, votes: Number(q.votes), createdAt: Number(q.created_at) })));
      const top = new Set(stage === 'closed' ? topQuestions(ranked).map(q => q.id) : []);
      asked = found.some(q => q.author_id === userId);
      // Author ids never leave the server: a citizen sees only whether a question is theirs.
      questions = ranked.map(q => ({ id: q.id, text: q.body, votes: q.votes, mine: q.author_id === userId, voted: Number(q.mine_vote) > 0, selected: top.has(q.id),
        answer: q.answer_text === null ? null : { text: q.answer_text, ai: true as const, at: Number(q.answered_at) },
        answerStatus: q.answer_text !== null ? 'answered' as const : top.has(q.id) ? 'pending' as const : 'none' as const }));
    }
    halls.push({ id, candidateId: candidate.id, candidateName: candidate.name, platform: candidate.platform, stage, opensAt, closesAt, asked, questions });
  }
  return { enabled: true, electionId: campaignId, halls, ai: { disclosure: townHallCopy.aiDisclosure.text, badge: true } };
}

const fail = (status: 400 | 403 | 404 | 409, error: string) => ({ ok: false as const, status, error });
/** Server-side write. The first question inside a hall's window creates the hall row (opens_at is the configured time, never the request time). Idempotent per request id;
 *  one question per citizen per hall. The citizen is Kindle-checked by the caller; ids and the hall come from the server, never the request body. */
export async function askQuestion(db: GameDatabase, userId: string, now: number, openAt: number | null, input: { candidateId: unknown; requestId: string; text: unknown }) {
  if (!knownCandidate(input.candidateId)) return fail(400, 'Pick one of the candidates.');
  return askInHall(db, userId, now, openAt, { id: townHallIdFor(input.candidateId), candidateId: input.candidateId, noun: 'town hall' }, input);
}
/** The one question path, shared by the town halls and the #282 debate (a hall row whose candidate_id is `debateHallCandidateId`): same text rule, same window, same one-question-per-citizen
 *  and request-id idempotency. `hall` comes from the server, never from the request body. */
export async function askInHall(db: GameDatabase, userId: string, now: number, openAt: number | null, hall: { id: string; candidateId: string; noun: string }, input: { requestId: string; text: unknown }) {
  if (!validQuestionText(input.text)) return fail(400, 'Keep the question between 10 and 200 characters, as plain text without links.');
  const id = hall.id;
  const prior = await db.prepare('SELECT hall_id,author_id FROM town_hall_questions WHERE request_id=?').bind(input.requestId).first<{ hall_id: string; author_id: string }>();
  if (prior) return prior.author_id === userId && prior.hall_id === id ? { ok: true as const, alreadyRecorded: true } : fail(409, 'Question receipt already used.');
  if (openAt === null || townHallStage(now, openAt, openAt + townHallWindowSeconds) !== 'open') return fail(409, `This ${hall.noun} is not taking questions.`);
  await db.prepare('INSERT INTO town_halls (id,election_id,candidate_id,opens_at,closes_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(id, campaignId, hall.candidateId, openAt, openAt + townHallWindowSeconds).run();
  const row = await db.prepare('SELECT opens_at,closes_at FROM town_halls WHERE id=?').bind(id).first<{ opens_at: number; closes_at: number }>();
  if (!row || townHallStage(now, Number(row.opens_at), Number(row.closes_at)) !== 'open') return fail(409, `This ${hall.noun} is not taking questions.`);
  const written = await db.prepare('INSERT INTO town_hall_questions (id,hall_id,author_id,request_id,body,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT DO NOTHING').bind(crypto.randomUUID(), id, userId, input.requestId, input.text, now).run();
  if (written.meta.changes !== 1) {
    // Lost a race: if the winner is this same request (a parallel retry), report it as the replay it is; otherwise this citizen already asked here.
    const same = await db.prepare('SELECT hall_id,author_id FROM town_hall_questions WHERE request_id=?').bind(input.requestId).first<{ hall_id: string; author_id: string }>();
    if (same) return same.author_id === userId && same.hall_id === id ? { ok: true as const, alreadyRecorded: true } : fail(409, 'Question receipt already used.');
    return fail(409, `You have already asked a question at this ${hall.noun}.`);
  }
  return { ok: true as const, alreadyRecorded: false };
}

/** Server-side write. One up-vote per citizen per question, never on your own question, only while the hall is open. A repeat (same or new request id) is a no-op that reports the first vote. */
export async function voteQuestion(db: GameDatabase, userId: string, now: number, input: { questionId: unknown; requestId: string }, scope: 'town-hall' | 'debate' = 'town-hall') {
  const noun = scope === 'debate' ? 'debate' : 'town hall';
  if (typeof input.questionId !== 'string' || input.questionId.length > 64) return fail(400, 'Pick a question.');
  const prior = await db.prepare('SELECT question_id,voter_id FROM town_hall_votes WHERE request_id=?').bind(input.requestId).first<{ question_id: string; voter_id: string }>();
  if (prior) return prior.voter_id === userId && prior.question_id === input.questionId ? { ok: true as const, alreadyRecorded: true } : fail(409, 'Vote receipt already used.');
  const written = await db.prepare(`INSERT INTO town_hall_votes (question_id,voter_id,request_id,voted_at)
 SELECT q.id,?,?,? FROM town_hall_questions q JOIN town_halls h ON h.id=q.hall_id WHERE q.id=? AND q.author_id<>? AND h.opens_at<=? AND h.closes_at>? AND h.candidate_id${scope === 'debate' ? '=' : '<>'}? ON CONFLICT DO NOTHING`).bind(userId, input.requestId, now, input.questionId, userId, now, now, debateHallCandidateId).run();
  if (written.meta.changes === 1) return { ok: true as const, alreadyRecorded: false };
  const existing = await db.prepare('SELECT 1 AS yes FROM town_hall_votes WHERE question_id=? AND voter_id=?').bind(input.questionId, userId).first<{ yes: number }>();
  if (existing) return { ok: true as const, alreadyRecorded: true };
  // Lost a race on the request id to a different voter or question: say so, not "not taking votes".
  const taken = await db.prepare('SELECT 1 AS yes FROM town_hall_votes WHERE request_id=?').bind(input.requestId).first<{ yes: number }>();
  if (taken) return fail(409, 'Vote receipt already used.');
  const question = await db.prepare('SELECT q.author_id,h.candidate_id FROM town_hall_questions q JOIN town_halls h ON h.id=q.hall_id WHERE q.id=?').bind(input.questionId).first<{ author_id: string; candidate_id: string }>();
  if (!question || (question.candidate_id === debateHallCandidateId) !== (scope === 'debate')) return fail(404, 'That question does not exist.');
  return fail(409, question.author_id === userId ? 'You cannot vote for your own question.' : `This ${noun} is not taking votes.`);
}

