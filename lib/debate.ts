import type { GameDatabase } from './database-contract';
import { electionCandidates, electionId as campaignId } from './elections';
import { fallbackFor } from './debate-copy';
import { activeIncomeTaxPercent } from './income-tax';
import { kindleTreasuryBalanceSql } from './economy';
import { latestStability } from './stability';
import { askInHall, epochSeconds, loadHallQuestions, voteQuestion } from './town-hall';
import { debateHallCandidateId, rankQuestions } from './town-hall-rules';
import { debateStage, debateTopQuestions, debateWindowSeconds, factChecks, type DebateStage, type FactCheck, type Figures } from './debate-rules';
export * from './debate-rules';

/** #282: the Kindle presidential debate PoC behind HARIMU_DEBATE_ENABLED (default "false"). Flag off: the route answers 404 before auth and nothing is read or written.
 *  Questions and up-votes are the town hall's (one more hall row, candidate_id 'debate'); the only new table is `debate_answers`. Rows are written only by POST (the hall row on the first
 *  question inside the window, a question, a vote) and by the scheduled Worker (`runDebateCron` in lib/debate-ai.ts). GET writes nothing and never calls the AI. A question with no saved AI answer
 *  shows the candidate's fallback line (lib/debate-copy.ts), computed on read, so the transcript is complete with the AI off, down or out of budget. */
export type DebateBindings = { HARIMU_DEBATE_ENABLED?: string; HARIMU_DEBATE_OPEN_AT?: string; HARIMU_KINDLE_INCOME_TAX_ENABLED?: string; NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW?: string; HARIMU_ACCOUNT_ELECTION_POC_ENABLED?: string };
export const debatesEnabled = (b: DebateBindings) => b.HARIMU_DEBATE_ENABLED === 'true';
/** [ASSUMPTION] No real calendar here (#351 owns it): an operator sets HARIMU_DEBATE_OPEN_AT (epoch seconds) and intake runs for 24 hours from then. Unset or invalid: the debate never opens. */
export const debateOpenAt = (b: DebateBindings): number | null => epochSeconds(b.HARIMU_DEBATE_OPEN_AT);
export const debateHallId = `${campaignId}-debate`;
const hall = { id: debateHallId, candidateId: debateHallCandidateId, noun: 'debate' };

export const debateSchemas = [
  `CREATE TABLE IF NOT EXISTS debate_answers (
 question_id TEXT NOT NULL REFERENCES town_hall_questions(id),
 candidate_id TEXT NOT NULL,
 answer_text TEXT NOT NULL CHECK(length(answer_text) BETWEEN 1 AND 600),
 answered_at INTEGER NOT NULL,
 PRIMARY KEY(question_id, candidate_id)
)`,
];

export type DebateQuestion = { id: string; text: string; votes: number; mine: boolean; voted: boolean; selected: boolean };
export type DebateAnswer = { candidateId: string; candidateName: string; text: string; source: 'ai' | 'fallback'; factChecks: FactCheck[] };
export type DebateTranscriptItem = { questionId: string; text: string; votes: number; answers: DebateAnswer[] };
export type DebateSnapshot = { enabled: true; electionId: string; debate: { id: string; stage: DebateStage; opensAt: number | null; closesAt: number | null; asked: boolean; questions: DebateQuestion[]; transcript: DebateTranscriptItem[] | null; usingFallback: boolean }; ai: { badge: true } };

/** The system's true figures, read-only: the tax rate in force (0 while the income tax is off), the Kindle treasury balance in SPK and the latest Kindle Stability score. A figure that cannot be read is left out. */
export async function readDebateFigures(db: GameDatabase, b: DebateBindings): Promise<Figures> {
  const figures: Figures = {};
  const percent = activeIncomeTaxPercent(b.HARIMU_KINDLE_INCOME_TAX_ENABLED);
  figures['income-tax'] = { value: percent, text: `${percent}%` };
  const treasury = await db.prepare(kindleTreasuryBalanceSql).first<{ balance: number }>().catch(() => null);
  if (treasury && Number.isFinite(Number(treasury.balance))) { const spk = Number(treasury.balance) / 100; figures.treasury = { value: spk, text: `${spk.toFixed(2)} SPK` }; }
  const stability = await latestStability(db, 'kindle').catch(() => null);
  if (stability) figures.stability = { value: stability.stability, text: `${stability.stability} of 100` };
  return figures;
}

/** Read-only. An unopened debate (no row yet) is projected from the configured open time; no row is created. */
export async function readDebate(db: GameDatabase, userId: string, now: number, openAt: number | null, figures: Figures): Promise<DebateSnapshot> {
  const row = await db.prepare('SELECT opens_at,closes_at FROM town_halls WHERE id=?').bind(debateHallId).first<{ opens_at: number; closes_at: number }>();
  const opensAt = row ? Number(row.opens_at) : openAt, closesAt = row ? Number(row.closes_at) : openAt === null ? null : openAt + debateWindowSeconds;
  const stage = debateStage(now, opensAt, closesAt);
  let questions: DebateQuestion[] = [], asked = false, transcript: DebateTranscriptItem[] | null = null, usingFallback = false;
  if (row) {
    const found = await loadHallQuestions(db, userId, debateHallId);
    const ranked = rankQuestions(found.map(q => ({ ...q, votes: Number(q.votes), createdAt: Number(q.created_at) })));
    const top = stage === 'closed' ? debateTopQuestions(ranked) : [];
    const selected = new Set(top.map(q => q.id));
    asked = found.some(q => q.author_id === userId);
    // Author ids never leave the server: a citizen sees only whether a question is theirs.
    questions = ranked.map(q => ({ id: q.id, text: q.body, votes: q.votes, mine: q.author_id === userId, voted: Number(q.mine_vote) > 0, selected: selected.has(q.id) }));
    if (stage === 'closed' && top.length > 0) {
      const saved = (await db.prepare('SELECT a.question_id,a.candidate_id,a.answer_text FROM debate_answers a JOIN town_hall_questions q ON q.id=a.question_id WHERE q.hall_id=?').bind(debateHallId).all<{ question_id: string; candidate_id: string; answer_text: string }>()).results;
      transcript = top.map(q => ({ questionId: q.id, text: q.body, votes: q.votes, answers: electionCandidates.map(candidate => {
        const ai = saved.find(a => a.question_id === q.id && a.candidate_id === candidate.id);
        const text = ai ? ai.answer_text : (fallbackFor(candidate.id)?.text ?? '').replace('{candidate}', candidate.name);
        if (!ai) usingFallback = true;
        return { candidateId: candidate.id, candidateName: candidate.name, text, source: ai ? 'ai' as const : 'fallback' as const, factChecks: factChecks(text, figures) };
      }) }));
    }
  }
  return { enabled: true, electionId: campaignId, debate: { id: debateHallId, stage, opensAt, closesAt, asked, questions, transcript, usingFallback }, ai: { badge: true } };
}

/** Server-side writes: the town hall's own question and up-vote paths, pointed at the debate hall. */
export const askDebateQuestion = (db: GameDatabase, userId: string, now: number, openAt: number | null, input: { requestId: string; text: unknown }) => askInHall(db, userId, now, openAt, hall, input);
export const voteDebateQuestion = (db: GameDatabase, userId: string, now: number, input: { questionId: unknown; requestId: string }) => voteQuestion(db, userId, now, input, 'debate');
