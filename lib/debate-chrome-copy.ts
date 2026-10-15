/** Kindle presidential debate panel chrome: the small labels the debate panel in PR #508 (closes #282) still marks as placeholders. Content only;
 * nothing imports this until those placeholder strings are swapped. The moderator lines, question intake lines, fact-check labels and the
 * fallback notice stay in the separate debate copy module and are not repeated here. Canon: harimu-docs politics/elections §9.4 (Debates row:
 * citizen questions ranked by up-votes, one vote per Tier-1 citizen, AI candidates answer, a fact-check panel beside the claims).
 *
 * Voice: system chrome. No byline, no AI badge (the answers carry their own badge in the panel), no in-character lines. No figure is written
 * into any line: the vote count is {count} and the minimum question length is {min}, both runtime values from the rules, and there is no
 * promise of when the debate opens. The empty states say what is missing and nothing else.
 *
 * Placeholders: {count} and {min} are whole numbers, tested at six characters. Limits: labels 40, lines 80, tested with each placeholder filled
 * to its cap. The shared name cap is re-exported for parity with the other copy modules (COUP_NAME_MAX from the palace coup copy module). All
 * wording is new: `proposal: true`. */

export { COUP_NAME_MAX as DEBATE_CHROME_NAME_MAX } from './palace-coup-copy';

export const DEBATE_CHROME_PLACEHOLDERS=['{count}','{min}'] as const;
export const DEBATE_CHROME_NUMBER_MAX=6;
export const DEBATE_CHROME_LABEL_MAX=40;
export const DEBATE_CHROME_LINE_MAX=80;

export type Line={text:string;proposal:true};
const L=(text:string):Line=>({text,proposal:true});

/** Panel heading, the not-yet-open state and the timer label. */
export const debateChrome={
 title:'Presidential debate',
 waiting:L('The debate is not open yet. Check back later.'),
 questionsCloseLabel:'Questions close',
 proposal:true,
} as const;

/** Empty states: nothing asked yet while intake is open, and nothing asked once it has closed. */
export const debateEmpty={
 noQuestionsYet:L('No questions yet. Be the first to ask the candidates.'),
 noQuestionsAsked:L('No questions were asked, so there is no transcript.'),
 proposal:true,
} as const;

/** Question form hint when the text is too short. {min} is the rule's minimum length. */
export const debateIntake={
 tooShort:L('Write at least {min} characters.'),
 proposal:true,
} as const;

/** The vote count beside a question, and the mark on the citizen's own question. */
export const debateQuestionMeta={
 voteOne:L('{count} vote'),
 voteMany:L('{count} votes'),
 yours:'yours',
 yoursAccessibleName:L('You asked this question'),
 proposal:true,
} as const;

/** Picks the singular or plural vote line. A count of exactly 1 is the singular. */
export function debateVotesLine(count:number):Line{return count===1?debateQuestionMeta.voteOne:debateQuestionMeta.voteMany;}
