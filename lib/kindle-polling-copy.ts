/** Kindle polling copy: the voluntary voter-intent prompt, its decline and privacy lines, the poll card chrome, a separately labeled resident-mood
 * strip and two press headline frames for a poll release (issue #611). Content only: sampling and margin math belong to the polling work, and
 * nothing imports this module. Canon: harimu-docs elections §9.4 (Polling: system polls from random samples of voluntary human voter-intent
 * answers, with a margin indicator; NPC sentiment may be shown separately as non-ballot information and is not an AI voting bloc), §9.3 and
 * Decision 65 (one verified human person, one election vote; NPCs cast no election ballots) and §9.5 (AI candidates cannot see who voted how;
 * they see only published results and polls).
 *
 * Voice: Kindle is plain and civic. The byline is not defined here: it is the Kindle pack's Republic Wire Service byline in the separate press
 * templates module, the one canonical form, and the press bodies open with that name. The press frames are bylined Republic Wire Service reports about a poll, not lines spoken for an AI leader
 * or body, so none carries the AI badge (#381 / ui-ux §23.2), and nothing here is badged. No line says or implies that answering a poll casts a
 * ballot, and every resident-mood line says it is not a vote. The privacy line says only what the docs say: AI candidates see the published
 * poll, not an answer. Nothing promises how long an answer is kept.
 *
 * Rules: no figure is written. Placeholders are pre-formatted strings filled at runtime: {from} and {to} (field dates), {candidate} and {rival}
 * (AI candidate names), all capped at a local 24 characters; {n} (the sample size, a number) and {margin} (the margin, already carrying its
 * unit), capped at six characters. Limits: labels 40, lines 100 (the field-dates caption counts as a line, since two dates fill to 48), headlines 70, press bodies 140, tested with every placeholder filled to its cap. All wording is
 * new: `proposal: true`. */

export const POLL_NAME_MAX=24;
export const POLL_NUMBER_MAX=6;
export const POLL_LABEL_MAX=40;
export const POLL_LINE_MAX=100;
export const POLL_HEADLINE_MAX=70;
export const POLL_BODY_MAX=140;
export const POLL_NAME_PLACEHOLDERS=['{from}','{to}','{candidate}','{rival}'] as const;
export const POLL_NUMBER_PLACEHOLDERS=['{n}','{margin}'] as const;

export type Line={text:string;proposal:true};
export type PressFrameKey='lead-change'|'race-tightens';
export type PressFrame={key:PressFrameKey;headline:string;body:string;aiBadge:false;proposal:true};

const L=(text:string):Line=>({text,proposal:true});

export const PRESS_FRAME_KEYS:readonly PressFrameKey[]=['lead-change','race-tightens'];

/** The voluntary voter-intent prompt, the decline option and the privacy lines. */
export const voterIntentPrompt={
 title:'Poll question',
 question:L('If the election were today, which candidate would you vote for?'),
 answerButton:'Answer',
 declineButton:'Skip this poll',
 voluntary:L('Answering is up to you. Skipping changes nothing.'),
 notAVote:L('A poll answer is not a vote. Only your ballot counts on election day.'),
 privacy:L('AI candidates see only the published poll, never your answer.'),
 thanks:L('Thanks. Your answer may be drawn into the next poll sample.'),
 proposal:true,
} as const;

/** Poll card chrome. */
export const pollCard={
 title:'Latest poll',
 fieldDates:'In the field {from} to {to}',
 sampleSize:'Sample: {n} answers',
 margin:'Margin: ±{margin}',
 marginExplainer:L('Results within the margin are too close to call.'),
 sampleExplainer:L('Drawn from a random sample of voluntary answers from human citizens.'),
 empty:L('Too few answers to publish a poll yet.'),
 proposal:true,
} as const;

/** The resident-mood strip, shown apart from the poll. Every line says it is not a vote. */
export const residentMood={
 label:'Resident mood (not votes)',
 explainer:L('Residents do not vote. Their mood is shown apart and is not counted as votes.'),
 sourceNote:L('Resident mood is a read of the street, not votes and not part of the poll.'),
 proposal:true,
} as const;

/** Press headline frames for a poll release. Reports about a poll: unbadged. */
export const pollPress:readonly PressFrame[]=[
 {key:'lead-change',headline:'{candidate} takes the lead in the latest poll',
  body:'Republic Wire Service: the latest poll puts {candidate} ahead of {rival}, with a margin of ±{margin}.',aiBadge:false,proposal:true},
 {key:'race-tightens',headline:'The race tightens',
  body:'Republic Wire Service: {candidate} and {rival} are now within the margin of ±{margin} in the latest poll.',aiBadge:false,proposal:true},
];
export const pollPressFor=(key:PressFrameKey)=>pollPress.find(f=>f.key===key);

export const kindlePollingCopy={prompt:voterIntentPrompt,card:pollCard,mood:residentMood,press:pollPress,proposal:true} as const;
