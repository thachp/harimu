/** Treaty-break notices and the NAP-blocked war refusal (issue #435, companion to #418 / #400 and #422). Content only: lib/diplomacy.ts owns
 * `breakTreaty` and the penalty, lib/war.ts owns the declaration block, and no UI imports this. Canon: harimu-docs trade-diplomacy-sanctions
 * §13.2 (a non-aggression pact bars war declarations between signatories for its term, and breaking it costs Legitimacy and global
 * Reputation; the docs name no cost for a trade agreement, so none is written for one), §13.1 (every ratifier is an AI body), ai-leadership
 * (the Crown and the Chairman speak for the state) and the three press voices (Republic Wire Service, Korund State Media, Court Gazette;
 * bylines are checked against lib/press-templates.ts). The failure reasons mirror the keys `breakTreaty` returns (`disabled`, `bad_nations`,
 * `not_found`, `not_signatory`, `not_in_force`), the refusal mirrors the `non_aggression` declaration block, and a test reads both source
 * files to keep the keys in step. Wording differs from the existing lines in lib/diplomacy-copy.ts (`brokenPactLine`) and lib/war-copy.ts
 * (`blockedDeclaration`), which this does not replace.
 *
 * Voice: results, failures, the cost words and the refusal are plain system lines (no officials, no byline, no badge). The per-nation break
 * news has two framings: `own` (our nation broke the pact) and `other` (the other side broke it). Kindle reports frankly and names the
 * Legitimacy hit; Korund State Media calls its own break "a necessary correction"; the Aurelle Gazette cites the Crown's honor. #381 / ui-ux
 * §23.2: the Chairman's own break and the Crown's own "Be it known" break speak for AI leaders and are AI-badged; Kindle lines and the
 * `other` reports (a foreign nation's act) are not. The rumors are marked as rumor and are not badged.
 *
 * Rules: no digits and no number words. The cost is named in words, and any amount comes only through {legitimacy} and {reputation}, which
 * are pre-formatted strings (the break costs are [ASSUMPTION] placeholders in #418). Placeholders ({breaker}, {other}, {nation}, {treaty},
 * {legitimacy}, {reputation}) are runtime values capped by the shared name cap, which this module re-exports (COUP_NAME_MAX from
 * lib/palace-coup-copy.ts). Limits: labels and headlines 40, lines 80, news bodies 140, tested with every placeholder filled to 24
 * characters. All wording is new: `proposal: true`. */

export { COUP_NAME_MAX as TREATY_BREAK_NAME_MAX } from './palace-coup-copy';

export const TREATY_BREAK_PLACEHOLDERS=['{breaker}','{other}','{nation}','{treaty}','{legitimacy}','{reputation}'] as const;
export const TREATY_BREAK_LABEL_MAX=40;
export const TREATY_BREAK_LINE_MAX=80;
export const TREATY_BREAK_BODY_MAX=140;

export type Line={text:string;proposal:true};
export type BreakFailureKey='disabled'|'bad_nations'|'not_found'|'not_signatory'|'not_in_force';
export type BreakNation='kindle'|'korund'|'aurelle';
export type BreakFraming='own'|'other';
export type BreakNotice={id:string;headline:string;body:string;aiBadge:boolean;proposal:true};
export type BreakNationNews={nationId:BreakNation;byline:{name:string;proposal:boolean};notices:Readonly<Record<BreakFraming,BreakNotice>>;proposal:true};
export type Rumor={text:string;rumor:true;aiBadge:false;proposal:true};
const L=(text:string):Line=>({text,proposal:true});

/** The reason keys `breakTreaty` returns on failure (lib/diplomacy.ts). */
export const BREAK_FAILURE_KEYS:readonly BreakFailureKey[]=['disabled','bad_nations','not_found','not_signatory','not_in_force'];
export const BREAK_NATIONS:readonly BreakNation[]=['kindle','korund','aurelle'];
export const BREAK_FRAMINGS:readonly BreakFraming[]=['own','other'];
/** The reason key of the declaration block for a pact in force (lib/war.ts). */
export const NAP_BLOCK_REASON='non_aggression' as const;

/** Break result for a citizen or official: success names who broke it; failures are one plain line per reason. */
export const treatyBreak={
 label:'Treaty break',
 success:[
  L('The {treaty} is broken. {breaker} broke it.'),
  L('{breaker} has broken the {treaty}.'),
 ],
 failures:{
  disabled:L('Treaties are not open yet.'),
  bad_nations:L('Only Kindle, Korund or Aurelle can break a treaty.'),
  not_found:L('That treaty could not be found.'),
  not_signatory:L('Only a nation that signed a treaty can break it.'),
  not_in_force:L('That treaty is not in force, so it cannot be broken.'),
 } as Readonly<Record<BreakFailureKey,Line>>,
 proposal:true,
} as const;

/** The cost, in words (a non-aggression pact only, §13.2) and with amounts only through placeholders. No line here gives a number. */
export const breakCost={
 label:'Cost of breaking',
 words:L('Breaking a pact costs Legitimacy and global Reputation.'),
 amounts:L('Cost: Legitimacy {legitimacy}, Reputation {reputation}.'),
 proposal:true,
} as const;

/** War declaration blocked by a pact in force (#422): label, two lines, and the reason key they answer. */
export const napBlocked={
 label:'Declaration blocked',
 reason:NAP_BLOCK_REASON,
 lines:[
  L('No war: a non-aggression pact with {nation} is in force.'),
  L('A non-aggression pact with {nation} bars a declaration.'),
 ],
 proposal:true,
} as const;

const b=(id:string,headline:string,body:string,aiBadge=false):BreakNotice=>({id,headline,body,aiBadge,proposal:true});
/** Break news about a non-aggression pact in each press voice. `own`: our nation broke it ({other} is the counterpart). `other`: the other side broke it
 * ({breaker}). The Chairman's and the Crown's own breaks are AI-badged. */
export const breakNews:readonly BreakNationNews[]=[
 {nationId:'kindle',byline:{name:'Republic Wire Service',proposal:true},proposal:true,notices:{
  own:b('kindle-own','Officials break a pact','Republic Wire Service: officials broke the pact with {other}. Breaking it costs Legitimacy and global Reputation.'),
  other:b('kindle-other','A pact with the Republic is broken','Republic Wire Service: {breaker} broke its pact with the Republic. Officials must say what comes next.')}},
 {nationId:'korund',byline:{name:'Korund State Media',proposal:false},proposal:true,notices:{
  own:b('korund-own','A necessary correction','Korund State Media reports: the Chairman ends the pact with {other}. A necessary correction.',true),
  other:b('korund-other','A pact is broken','Korund State Media reports: {breaker} has broken its pact with Korund. Order is kept.')}},
 {nationId:'aurelle',byline:{name:'Court Gazette',proposal:false},proposal:true,notices:{
  own:b('aurelle-own','A pact is ended by decree','Be it known: the Crown ends the pact with {other}, for the honor of the realm.',true),
  other:b('aurelle-other','A pact with the realm is broken','The Court Gazette reports that {breaker} has broken its pact with the realm. The Crown has taken note.')}},
];
export function breakNewsFor(nationId:BreakNation){return breakNews.find(x=>x.nationId===nationId);}

/** Optional Gazette rumor that a pact was broken. Marked as rumor; nothing is confirmed; no official speaks. */
const r=(text:string):Rumor=>({text,rumor:true,aiBadge:false,proposal:true});
export const brokenPactRumors:readonly Rumor[]=[
 r('Rumor has it a pact was broken. Nothing is confirmed yet.'),
 r('The court whispers of a broken pact. Only a rumor, mind.'),
];
