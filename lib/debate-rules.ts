/** #282: Kindle presidential debate PoC (docs §9.4, Debates row). Pure rules; the only import is the shared question rules from #441.
 *  One debate per election. Citizens ask and up-vote questions through the SAME path as the town halls (lib/town-hall.ts); once intake closes the top 5 are put to every AI candidate.
 *  [ASSUMPTION] intake runs for the town hall window (24 hours, the hall table's CHECK) and the top 5 is from the issue. Nothing here reads a clock or a database. */
import { rankQuestions, townHallStage, townHallWindowSeconds, type RankedQuestion, type TownHallStage } from './town-hall-rules';
export const debateWindowSeconds = townHallWindowSeconds;
export const debateQuestionsAsked = 5;
export type DebateStage = TownHallStage;
export const debateStage = townHallStage;
/** The questions put to the candidates: the first 5 of the ranking (votes, then earliest submitted, then id). Only meaningful once intake has closed. */
export const debateTopQuestions = <T extends RankedQuestion>(questions: readonly T[]): T[] => rankQuestions(questions).slice(0, debateQuestionsAsked);

/** The tracked figures a claim is checked against: the Kindle income tax rate in force, the Kindle treasury balance and the Kindle Stability score. */
export type FigureKind = 'income-tax' | 'treasury' | 'stability';
export type Figure = { value: number; text: string };
export type Figures = Partial<Record<FigureKind, Figure>>;
export type FactCheck = { kind: FigureKind; claim: string; systemFigure: string; verdict: 'matches' | 'differs' | null };
const subjects: readonly (readonly [FigureKind, RegExp])[] = [['income-tax', /\btax(?:es)?\b/i], ['treasury', /\btreasur(?:y|ies)\b/i], ['stability', /\bstability\b/i]];
/** Every sentence that names a tracked figure's subject gets that figure beside it. When the sentence also states a number, the verdict says whether it equals the system's figure;
 *  with no number there is no verdict, only the figure. Pure and deterministic; a subject whose figure is unavailable gets no entry (nothing true to show). */
export function factChecks(text: string, figures: Figures): FactCheck[] {
  const out: FactCheck[] = [];
  for (const sentence of text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean)) {
    for (const [kind, subject] of subjects) {
      const figure = figures[kind];
      if (!figure || !subject.test(sentence)) continue;
      const stated = sentence.match(/\d[\d,]*(?:\.\d+)?/);
      const number = stated ? Number(stated[0].replace(/,/g, '')) : null;
      out.push({ kind, claim: sentence, systemFigure: figure.text, verdict: number === null || !Number.isFinite(number) ? null : Math.abs(number - figure.value) < 0.005 ? 'matches' : 'differs' });
    }
  }
  return out;
}
