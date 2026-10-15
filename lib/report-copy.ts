/** Out-of-character Report copy for citizen chat, AI leader addresses, AI-written news and Notable replies (issue #457, docs §21.3). Content
 * only: the report button, its dialog, the backend report record and the moderation queue belong to other lanes, and no UI imports this.
 * Canon: harimu-docs moderation-safety §21.3 (a report button on every message, name, poster, profile "and every AI-generated speech, article
 * or Notable reply"), §21.1 (moderation reports are "a separate, clearly labeled OOC tool; in-game 'denunciation' is a different button"; the
 * risk rows for real-world politics, hate, harassment, doxxing and threats), §21.4 (what AI content must not contain) and the wellbeing page
 * ("a clear process for players to report AI behavior and get it reviewed").
 *
 * Voice: one neutral Harimu voice, the same in every nation. The header says the report goes to Harimu moderators, outside the game, and is
 * not an in-game act. It uses no nation's voice and none of the in-game mechanics words (Suspicion, informing, denunciation, surveillance,
 * Correction Duty). Every line here is a system line: no byline, no AI voice, no AI badge (#381 / ui-ux §23.2); the AI-only reason names
 * AI output as the thing reported and does not speak for an AI.
 *
 * Rules: no figures, no placeholders (nothing is filled at runtime), no promise that a report is reviewed within a time, acted on, or kept
 * anonymous (the docs do not say whether the reporter is anonymous, so no line says or implies it). The reasons are drawn from §21.1 and
 * §21.4; the AI-only reason ("AI said something it shouldn't") is marked `aiOnly` and `reasonsFor` shows it for AI targets only. Limits:
 * labels 40, lines (including accessible names) 80. All wording is new: `proposal: true`. */

export const REPORT_LABEL_MAX=40;
export const REPORT_LINE_MAX=80;

export type Line={text:string;proposal:true};
export type ReportTargetId='citizen-message'|'ai-leader-address'|'ai-news'|'notable-reply';
export type ReportReasonId='real-world-politics'|'hate-harassment'|'threats-danger'|'sexual-content'|'ai-inappropriate'|'spam-other';
export type ReportTarget={id:ReportTargetId;entryLabel:string;accessibleName:string;aiTarget:boolean;proposal:true};
export type ReportReason={id:ReportReasonId;label:string;aiOnly:boolean;proposal:true};

export const REPORT_TARGET_IDS:readonly ReportTargetId[]=['citizen-message','ai-leader-address','ai-news','notable-reply'];
export const REPORT_REASON_IDS:readonly ReportReasonId[]=['real-world-politics','hate-harassment','threats-danger','sexual-content','ai-inappropriate','spam-other'];

const L=(text:string):Line=>({text,proposal:true});
const t=(id:ReportTargetId,entryLabel:string,accessibleName:string,aiTarget:boolean):ReportTarget=>({id,entryLabel,accessibleName,aiTarget,proposal:true});
const r=(id:ReportReasonId,label:string,aiOnly=false):ReportReason=>({id,label,aiOnly,proposal:true});

/** One entry label and accessible name for each MVP target. The AI targets are marked `aiTarget`. */
export const reportTargets:readonly ReportTarget[]=[
 t('citizen-message','Report this message','Report this chat message to Harimu moderators',false),
 t('ai-leader-address','Report this address','Report this AI leader address to Harimu moderators',true),
 t('ai-news','Report this article','Report this AI-written news line to Harimu moderators',true),
 t('notable-reply','Report this reply','Report this Notable reply to Harimu moderators',true),
];
export function reportTargetFor(id:ReportTargetId){return reportTargets.find(x=>x.id===id);}

/** The shared out-of-character header: one constant for every nation, in no nation's voice. */
export const reportHeader={
 title:'Report to Harimu moderators',
 line:L('This goes to Harimu moderators, outside the game. It is not an in-game act.'),
 proposal:true,
} as const;

/** Reasons from §21.1 and §21.4. `ai-inappropriate` is marked `aiOnly` and shows only for AI targets. */
export const reportReasons:readonly ReportReason[]=[
 r('real-world-politics','Real-world politics, people or symbols'),
 r('hate-harassment','Hate or harassment'),
 r('threats-danger','Threats, danger or personal details'),
 r('sexual-content','Sexual content'),
 r('ai-inappropriate','AI said something it shouldn\'t',true),
 r('spam-other','Spam or something else'),
];
/** The reasons to offer for a target: the AI-only reason is left out for a citizen message. */
export function reasonsFor(id:ReportTargetId){const target=reportTargetFor(id);return reportReasons.filter(x=>!x.aiOnly||(target?.aiTarget??false));}

export const reportNote={
 label:'Add a note (optional)',
 placeholder:L('Tell moderators what happened.'),
 proposal:true,
} as const;

/** Buttons and the three result states: sent, already reported, and failed (retry). */
export const reportActions={
 submit:'Send report',
 cancel:'Cancel',
 retry:'Try again',
 proposal:true,
} as const;
export const reportStates={
 sent:L('Report sent to Harimu moderators.'),
 duplicate:L('You already reported this.'),
 failed:L('The report was not sent. Please try again.'),
 proposal:true,
} as const;
