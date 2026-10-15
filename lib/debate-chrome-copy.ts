/** Kindle presidential debate stage chrome: the five lines the debate panel in PR #508 (closes #282) still hardcodes and marks "label: Content"
 * (issue #511). Content only; nothing imports this until those literals are swapped. The moderator lines, question intake lines, fact-check
 * labels and the fallback notice stay in the separate debate copy module and are not repeated here, and the vote-count wording is out of scope.
 * Canon: harimu-docs politics/elections §9.4 (Debates row: citizen questions ranked by up-votes, AI candidates answer, a fact-check panel beside
 * the claims). Key names follow the panel's stages: waiting, open (empty list, timer) and closed (empty transcript).
 *
 * Voice: system chrome, plain. No byline, no AI badge, no in-character line. No figure and no schedule promise: nothing says when the debate
 * opens. Limits: labels 40, lines 80. The shared name cap is re-exported for parity with the other copy modules (COUP_NAME_MAX from the palace
 * coup copy module). All wording is new: `proposal: true`. */

export { COUP_NAME_MAX as DEBATE_CHROME_NAME_MAX } from './palace-coup-copy';

export const DEBATE_CHROME_LABEL_MAX=40;
export const DEBATE_CHROME_LINE_MAX=80;

export type Line={text:string;proposal:true};
const L=(text:string):Line=>({text,proposal:true});

/** The panel's visible chrome, one key per spot in the panel. */
export const debateChrome={
 /** Panel heading (the h3). */
 title:'Presidential debate',
 /** stage 'waiting'. */
 waiting:L('The debate is not open yet. Check back later.'),
 /** stage 'open' with no questions yet. */
 emptyOpen:L('No questions yet. Be the first to ask the candidates.'),
 /** stage 'closed' with no transcript (transcript is null). */
 emptyClosed:L('No questions were asked, so there is no transcript.'),
 /** The GameTimer label while intake is open. */
 questionsCloseLabel:'Questions close',
 proposal:true,
} as const;
