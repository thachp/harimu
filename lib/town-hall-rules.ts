/** #441: Kindle town hall PoC (docs §9.4, Town halls row). Pure rules, no imports.
 *  One town hall per AI presidential candidate per campaign. Citizens post questions and up-vote each other's for 24 real hours; once it closes the top 10 by
 *  up-votes (ties by earliest, then by id) are answered by the AI candidate. Nothing here reads a clock or a database.
 *  [ASSUMPTION] every number below except the 24 hours and the top 10 (both from the issue and the docs) is a PoC placeholder for ARC and Design. */
export const townHallWindowSeconds = 24 * 3600;
export const townHallTopAnswered = 10;
/** [ASSUMPTION] question length bounds in characters. */
export const townHallQuestionMin = 10;
export const townHallQuestionMax = 200;
export type TownHallStage = 'waiting' | 'open' | 'closed';

/** The same text checks the petitions use (trimmed, bounded, no control characters), plus no links or addresses: the question is shown to every citizen and fed to the AI as untrusted text. */
export function validQuestionText(value: unknown): value is string {
  return typeof value === 'string' && value === value.trim() && value.length >= townHallQuestionMin && value.length <= townHallQuestionMax
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) && !/[a-z][a-z0-9+.-]*:\/\/|\bwww\.|@|<|>/i.test(value);
}
export function townHallStage(now: number, opensAt: number | null, closesAt: number | null): TownHallStage {
  if (opensAt === null || closesAt === null || now < opensAt) return 'waiting';
  return now < closesAt ? 'open' : 'closed';
}
export type RankedQuestion = { id: string; votes: number; createdAt: number };
/** Most up-votes first; a tie goes to the earlier question, and a same-second tie to the smaller id, so the order is total and never changes. */
export function rankQuestions<T extends RankedQuestion>(questions: readonly T[]): T[] {
  return [...questions].sort((a, b) => b.votes - a.votes || a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
/** The questions the candidate answers: exactly the first `townHallTopAnswered` (or fewer) of the ranking. Only meaningful once the hall has closed. */
export const topQuestions = <T extends RankedQuestion>(questions: readonly T[]): T[] => rankQuestions(questions).slice(0, townHallTopAnswered);
