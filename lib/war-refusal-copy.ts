/** War declaration refusals for the rate limits and the casus belli gate, plus a per-nation mobilization countdown line (issue #461,
 * companion to #350 / #426). Content only: the war routes own declarations and no UI imports this. Canon: harimu-docs
 * trade-diplomacy-sanctions §13.5 (at most 1 new offensive war declaration per nation per interval of real days, and at most 2 active offensive wars per
 * nation; the rules engine only offers a declaration when a deterministic grievance score passes its threshold, so an AI cannot start a war
 * "because the model felt like it") and territory-cities-warfare §15.3 (a formal declaration with a 48-real-hour mobilization period before
 * any attack). The refusals for the Founding Period, a non-aggression pact and the peace lock already exist in the war copy module, and the
 * treaty-break and NAP-blocked refusals are in the treaty-break copy module (#435); none of them is repeated here, and a test checks it.
 * The declaration and mobilization-ended news for all three nations are also already in the war copy module.
 *
 * Voice: refusals are plain system lines for the AI-leader log and news, in the same shape as the existing refusals ("The declaration was
 * not made. ..."): reasons, never threats, no byline, no officials and no AI badge. The countdown lines are short system captions with a
 * hint of each nation's voice (Kindle plain, Korund calm and collective, Aurelle formal); they carry no byline and no badge, because a
 * banner caption is a system line (#381 / ui-ux §23.2). {endsAt} and {nextAt} are pre-formatted strings filled at runtime. The refusal
 * keys below are the copy's own names; REFUSAL_CODES at the end of this module maps the server's refusal codes (ARC's ruling on #426) to them.
 *
 * Rules: figures come only from the docs: 1 and 2 (rate limits) and 48 (mobilization hours), each real; nothing else is written. The length of the rate-limit interval is not written: the docs mark it as an assumption, so the line takes it as {days}, a runtime value from the rules. The
 * threshold of the grievance score is not given by the docs and is never named. The placeholders are runtime values capped by the shared name cap,
 * which this module re-exports (COUP_NAME_MAX from lib/palace-coup-copy.ts). Limits: labels 40, lines 140 (refusal lines are full
 * sentences, like the existing refusals), countdown captions 80, tested with every placeholder filled to 24 characters. All wording is
 * new: `proposal: true`. */

export { COUP_NAME_MAX as REFUSAL_NAME_MAX } from './palace-coup-copy';

/** {days}: the rate-limit interval in real days, a runtime value (the docs treat the figure as an assumption, so it is not written into a line). */
export const REFUSAL_PLACEHOLDERS=['{endsAt}','{nextAt}','{days}'] as const;
export const REFUSAL_LABEL_MAX=40;
export const REFUSAL_CAPTION_MAX=80;
export const REFUSAL_LINE_MAX=140;
/** The docs' figures (§13.5, §15.3); the interval in days is the {days} placeholder, not a constant. */
export const ACTIVE_OFFENSIVE_WARS_MAX=2;
export const MOBILIZATION_HOURS=48;

export type Line={text:string;proposal:true};
export type RefusalKey='rate_limit'|'active_war_cap'|'casus_belli';
export type RefusalNation='kindle'|'korund'|'aurelle';
export type Refusal={key:RefusalKey;label:string;lines:readonly [Line,Line];proposal:true};

/** Proposed refusal keys, in the order the rules would check them. */
export const REFUSAL_KEYS:readonly RefusalKey[]=['rate_limit','active_war_cap','casus_belli'];
export const REFUSAL_NATIONS:readonly RefusalNation[]=['kindle','korund','aurelle'];

const L=(text:string):Line=>({text,proposal:true});

/** Refusals, two variants each. Plain system lines: reasons, not threats. */
export const declarationRefusals:readonly Refusal[]=[
 {key:'rate_limit',label:'Declaration limit',proposal:true,lines:[
  L('The declaration was not made. A nation may declare at most 1 new offensive war every {days} real days.'),
  L('The declaration was not made. This nation declared a war recently. It can declare again on {nextAt}.')]},
 {key:'active_war_cap',label:'War limit reached',proposal:true,lines:[
  L('The declaration was not made. A nation may have at most 2 active offensive wars.'),
  L('The declaration was not made. This nation already has 2 active offensive wars. An active war has to end first.')]},
 {key:'casus_belli',label:'No grounds for war',proposal:true,lines:[
  L('The declaration was not made. War needs grounds, and no grievance on record warrants it yet.'),
  L('The declaration was not made. A declaration is offered only when real grievances warrant it.')]},
];
export function refusalFor(key:RefusalKey){return declarationRefusals.find(x=>x.key===key);}

/** Mobilization countdown caption for each nation's Country view (48 real hours). A system caption with a hint of the nation's voice. */
export const mobilizationCountdown:Readonly<Record<RefusalNation,Line>>={
 kindle:L('The Republic is mobilizing. Nothing can start before {endsAt}.'),
 korund:L('Brigades hold the plan until {endsAt}. No attack before then.'),
 aurelle:L('The realm musters until {endsAt}. No attack before then.'),
};
export const mobilizationCountdownLabel={text:'Mobilization countdown',proposal:true} as const;

/** The server refusal codes for the declare path (ARC's ruling on #426 for the two rate limits, and the casus belli code the #426 build PR uses, `no_casus_belli`; issue #561 first called it `casus_belli_insufficient`), mapped to the refusal copy above. `declareWar` refuses
 * with one of these codes and the caller shows `refusalForCode(code)`. The casus belli code covers the whole grievance gate: the player is
 * never told the score, its inputs, their weights or the threshold. The rate-limit codes are checked first, then the gate. */
export type RefusalCode='rate_limit_declarations'|'rate_limit_active_wars'|'no_casus_belli';
export const REFUSAL_CODES:Readonly<Record<RefusalCode,RefusalKey>>={
 rate_limit_declarations:'rate_limit',
 rate_limit_active_wars:'active_war_cap',
 no_casus_belli:'casus_belli',
};
export function refusalForCode(code:string){
 const key=(REFUSAL_CODES as Readonly<Record<string,RefusalKey|undefined>>)[code];
 return key?refusalFor(key):undefined;
}
