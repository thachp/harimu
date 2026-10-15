/** Embargo and targeted-sanctions notices for Kindle, Korund and Aurelle (issue #359, companion to #313 / lib/diplomacy-copy.ts).
 * Content only: SDE owns embargo wiring and no UI imports this. Canon: harimu-docs trade-diplomacy-sanctions §13.3 (an embargo
 * forbids all trade with a target; targeted sanctions ban specific goods or named officials, freezing their foreign assets and
 * exchange access; sanctions also hurt the sanctioning economy through lost exports), §13.3.1 (a bilateral embargo stops
 * Clearing House netting between the pair), §13.1 (every negotiator and ratifying body is an AI), MVP Scope Diplomacy row
 * ("embargo"), and the three press voices: Kindle (#237, Republic Wire Service), Korund State Media (#238/#244) and the
 * Aurelle Court Gazette (#239). Bylines match lib/press-templates.ts, as in lib/diplomacy-copy.ts.
 *
 * Rules: no invented figures: no tariff percentages, reserve amounts, street rates, durations or trade volumes. A duration is shown
 * only through {endsAt}. Out of scope: multilateral sanctions, Clearing House suspension, smuggling and evasion, non-MVP nations.
 * No official is named: {office} is a runtime value. Placeholders ({nation}, {actor}, {target}, {good}, {office}, {endsAt}) are
 * pre-formatted strings capped by the shared name cap, which this module re-exports (COUP_NAME_MAX from lib/palace-coup-copy.ts).
 * Press headlines are fixed text (no placeholder), as in lib/diplomacy-copy.ts. Only "Be it known" Crown lines are AI-badged;
 * bylined reports are not. Limits: labels and headlines 40, lines 80 (ARC's number for this batch), tested with every placeholder
 * filled to 24 characters. All wording is new: `proposal: true`. */

export { COUP_NAME_MAX as EMBARGO_NAME_MAX } from './palace-coup-copy';

export const EMBARGO_PLACEHOLDERS=['{nation}','{actor}','{target}','{good}','{office}','{endsAt}'] as const;
export const EMBARGO_LABEL_MAX=40;
export const EMBARGO_LINE_MAX=80;

export type Line={text:string;proposal:true};
export type EmbargoNation='kindle'|'korund'|'aurelle';
export type EmbargoEvent='imposed'|'lifted';
/** A press line with its canon byline. `aiBadge` is true only where the Crown speaks in its own voice ("Be it known"). */
export type PressLine={text:string;aiBadge:boolean;proposal:true};
export type EmbargoPress={nationId:EmbargoNation;byline:{name:string;proposal:boolean};headline:Readonly<Record<EmbargoEvent,string>>;report:Readonly<Record<EmbargoEvent,PressLine>>;crown?:Readonly<Record<EmbargoEvent,PressLine>>;proposal:true};

export const EMBARGO_NATIONS:readonly EmbargoNation[]=['kindle','korund','aurelle'];
export const EMBARGO_EVENTS:readonly EmbargoEvent[]=['imposed','lifted'];

const L=(text:string):Line=>({text,proposal:true});
const P=(text:string,aiBadge=false):PressLine=>({text,aiBadge,proposal:true});

/** Private UI: impose and lift confirmations. §13.3: an embargo forbids all trade with the target, and it costs the sanctioner exports. */
export const embargoPrivate={
 imposeButton:'Impose embargo',
 liftButton:'Lift embargo',
 imposePrompt:L('Impose an embargo on {nation}? All trade with it will stop.'),
 costNote:L('An embargo also costs the sanctioner its own exports.'),
 clearingNote:L('The Clearing House stops netting trade between the pair.'),
 imposed:L('The embargo on {nation} is in force.'),
 endsLine:L('The embargo on {nation} runs until {endsAt}.'),
 liftPrompt:L('Lift the embargo on {nation}? Trade with it can resume.'),
 lifted:L('The embargo on {nation} is lifted.'),
 proposal:true,
} as const;

/** Refusals when posting or filling an order across an embargo. */
export const tradeClosed={
 post:L('You cannot post this order. Trade with {nation} is closed.'),
 fill:L('You cannot fill this order. Trade with {nation} is closed.'),
 proposal:true,
} as const;

/** One targeted-sanction line per kind (§13.3): a banned good, or a named official's foreign assets and exchange access. */
export const targetedSanctions={
 good:L('Sanction: trade in {good} is banned.'),
 office:L('Frozen: foreign assets and exchange access of {office}.'),
 proposal:true,
} as const;

/** Press: a fixed headline and one report per event in each nation's voice, with {actor} and {target}. Aurelle also has Crown lines
 * for when the Crown itself acts; they use {target} only and are AI-badged. */
export const embargoPress:readonly EmbargoPress[]=[
 {nationId:'kindle',byline:{name:'Republic Wire Service',proposal:true},proposal:true,
  headline:{imposed:'A trade embargo is imposed',lifted:'A trade embargo is lifted'},
  report:{imposed:P('Embargo: {actor} ends all trade with {target}.'),lifted:P('Lifted: {actor} reopens trade with {target}.')}},
 {nationId:'korund',byline:{name:'Korund State Media',proposal:false},proposal:true,
  headline:{imposed:'State Media: embargo imposed',lifted:'State Media: embargo lifted'},
  report:{imposed:P('State Media: {actor} embargoes {target}.'),lifted:P('State Media: {actor} lifts embargo on {target}.')}},
 {nationId:'aurelle',byline:{name:'Court Gazette',proposal:false},proposal:true,
  headline:{imposed:'The Court notes an embargo',lifted:'The Court notes an embargo ended'},
  report:{imposed:P('Court Gazette: {actor} embargoes {target}.'),lifted:P('Court Gazette: {actor} reopens {target} trade.')},
  crown:{imposed:P('Be it known: the Crown embargoes {target}.',true),lifted:P('Be it known: the Crown lifts its embargo on {target}.',true)}},
];
export function pressFor(nationId:EmbargoNation){return embargoPress.find(x=>x.nationId===nationId);}
