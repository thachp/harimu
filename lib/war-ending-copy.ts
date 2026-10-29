/** Surrender and concession war-ending copy for Kindle, Korund and Aurelle (issue #744, companion to #427). Content only:
 * lib/war-endings.ts owns proposals, ratification and the peace lock, and nothing imports this. lib/peace-copy.ts covers peace
 * treaties and ceasefires; this sibling covers surrender and concession only. Canon: territory-cities-warfare §15.3 and §15.4
 * (Decision 109: private title stays with its owner; no line promises compensation or says private land changes hands),
 * trade-diplomacy-sanctions §13.1 (Kindle Assembly, Korund Chairman, Aurelle Crown) and §13.2. Bylines match lib/press-templates.ts.
 * Crown "Be it known" lines are AI-badged, and so, since #381 (docs ui-ux 23.2), are Korund State Media lines, which speak for the
 * AI Chairman.
 *
 * Figures come only from the code, never invented. The peace lock is PEACE_LOCK_SECONDS in lib/war-rules.ts (10 * 86400, so 10 real
 * days): an enacted ending sets end_kind 'treaty', which starts that lock. A concession lists 1 to maxCededSquares (10) distinct
 * squares (cleanSquares). Kindle's Assembly: a surrender is a simple majority, more than half (yes * 2 > total); a concession,
 * ceding or receiving, is two-thirds, at least two-thirds (yes * 3 >= total * 2). Surrender is ratified by the surrendering nation
 * alone; a concession by both nations. Korund's Chairman and Aurelle's Crown ratify alone (soleRatification). Placeholders
 * ({other}, {readyAt}) are pre-formatted strings capped by the shared name cap (COUP_NAME_MAX from lib/palace-coup-copy.ts).
 * Limits: labels and headlines 40, lines 80, tested with every placeholder filled to 24 characters. The square picker caption is a
 * line, not a label. All wording is new: `proposal: true`. */

export { COUP_NAME_MAX as WAR_ENDING_NAME_MAX } from './palace-coup-copy';

export const WAR_ENDING_PLACEHOLDERS=['{other}','{readyAt}'] as const;
export const WAR_ENDING_LABEL_MAX=40;
export const WAR_ENDING_LINE_MAX=80;
/** Real days. Matches PEACE_LOCK_SECONDS / 86400 in lib/war-rules.ts. */
export const WAR_ENDING_PEACE_LOCK_DAYS=10;
/** Matches maxCededSquares in lib/war-endings.ts. */
export const WAR_ENDING_MAX_CEDED_SQUARES=10;
/** cleanSquares refuses a list shorter than 1, and the bad_squares error starts at 1. */
export const WAR_ENDING_MIN_CEDED_SQUARES=1;

export type Line={text:string;proposal:true};
export type EndingNation='kindle'|'korund'|'aurelle';
export type EndingKind='surrender'|'concession';
export type EndingPressEvent='surrenderEnacted'|'concessionRatified'|'endingRejected';
export type PressLine={text:string;aiBadge:boolean;proposal:true};
export type EndingPress={nationId:EndingNation;byline:{name:string;proposal:boolean};headline:Readonly<Record<EndingPressEvent,string>>;report:Readonly<Record<EndingPressEvent,PressLine>>;crown?:Partial<Readonly<Record<EndingPressEvent,PressLine>>>;proposal:true};
export type EndingRefusal={reason:string;line:Line;proposal:true};

export const ENDING_NATIONS:readonly EndingNation[]=['kindle','korund','aurelle'];
export const ENDING_KINDS:readonly EndingKind[]=['surrender','concession'];
export const ENDING_PRESS_EVENTS:readonly EndingPressEvent[]=['surrenderEnacted','concessionRatified','endingRejected'];

const L=(text:string):Line=>({text,proposal:true});
const P=(text:string,aiBadge=false):PressLine=>({text,aiBadge,proposal:true});
const days=WAR_ENDING_PEACE_LOCK_DAYS;
const squares=`${WAR_ENDING_MIN_CEDED_SQUARES} to ${WAR_ENDING_MAX_CEDED_SQUARES}`;

/** Proposal labels and the square picker. Buttons are labels. The caption lists only Frontier squares the nation governs. */
export const endingProposal={
 surrenderButton:'Propose surrender',
 concessionButton:'Propose a concession',
 surrenderPrompt:L('Propose surrender to {other}? Only your nation ratifies it.'),
 concessionPrompt:L('Propose a concession to {other}? Both nations must ratify it.'),
 squareCaption:L(`Only Frontier squares your nation governs: ${squares}, never privately owned.`),
 proposal:true,
} as const;

/** Pending ratification. Surrender: the yielding nation alone. Concession: both nations. Kindle states the vote the code uses. */
export const endingPending={
 status:L('This ending awaits ratification.'),
 surrenderScope:L('A surrender is ratified by the surrendering nation alone.'),
 concessionScope:L('A concession is ratified by both nations.'),
 kindle:{
  surrender:L('The Kindle Assembly ratifies a surrender by simple majority: more than half.'),
  concession:L('The Kindle Assembly ratifies a concession by at least two-thirds.'),
 },
 korund:{
  surrender:L('The Korund Chairman ratifies a surrender alone.'),
  concession:L('The Korund Chairman ratifies a concession alone.'),
 },
 aurelle:{
  surrender:L('The Aurelle Crown ratifies a surrender alone.'),
  concession:L('The Aurelle Crown ratifies a concession alone.'),
 },
 proposal:true,
} as const;
export function endingBodyFor(nationId:EndingNation,kind:EndingKind){return endingPending[nationId][kind];}

/** Results. The peace lock follows an enacted ending only, for the code's lock length, until {readyAt}. */
export const endingResults={
 surrenderEnacted:L('Surrender enacted. The war with {other} is over.'),
 surrenderRejected:L('Surrender rejected. The war with {other} goes on.'),
 concessionEnacted:L('Concession enacted. The war with {other} is over.'),
 concessionRejected:L('Concession rejected. The war with {other} goes on.'),
 peaceLock:L(`Peace lock after enactment: ${days} real days, until {readyAt}.`),
 nationalControl:L('A concession moves national control only. Private title stays with its owner.'),
 proposal:true,
} as const;

/** Press from each nation's own war. {other} is the other party. Headlines are fixed text. */
export const endingPress:readonly EndingPress[]=[
 {nationId:'kindle',byline:{name:'Kindle Press',proposal:false},proposal:true,
  headline:{surrenderEnacted:'Surrender is enacted',concessionRatified:'A concession is ratified',endingRejected:'An ending is rejected'},
  report:{
   surrenderEnacted:P('Surrender with {other} enacted. Ask officials what was agreed.'),
   concessionRatified:P('Concession with {other} ratified. Ask which squares were ceded.'),
   endingRejected:P('The ending with {other} was rejected. The war goes on.'),
  }},
 {nationId:'korund',byline:{name:'Korund State Media',proposal:false},proposal:true,
  headline:{surrenderEnacted:'State Media: surrender enacted',concessionRatified:'State Media: concession ratified',endingRejected:'State Media: ending rejected'},
  report:{
   surrenderEnacted:P('State Media: surrender with {other} enacted. The plan goes on.',true),
   concessionRatified:P('State Media: concession with {other} ratified. The plan holds.',true),
   endingRejected:P('State Media: the ending with {other} was rejected.',true),
  }},
 {nationId:'aurelle',byline:{name:'Court Gazette',proposal:false},proposal:true,
  headline:{surrenderEnacted:'The Court notes a surrender',concessionRatified:'The Court notes a concession',endingRejected:'The Court notes a rejection'},
  report:{
   surrenderEnacted:P('Court Gazette: surrender with {other} is enacted.'),
   concessionRatified:P('Court Gazette: the concession with {other} is ratified.'),
   endingRejected:P('Court Gazette: the ending with {other} was rejected.'),
  },
  crown:{
   surrenderEnacted:P('Be it known: the Crown enacts surrender with {other}.',true),
   concessionRatified:P('Be it known: the Crown ratifies the concession with {other}.',true),
  }},
];
export function endingPressFor(nationId:EndingNation){return endingPress.find(x=>x.nationId===nationId);}

/** One plain refusal per reason proposeWarEnding returns. System lines: no byline, no AI badge. */
export const endingRefusals:readonly EndingRefusal[]=[
 {reason:'bad_request',proposal:true,line:L('Refused. Give a request id, and propose a surrender or a concession.')},
 {reason:'request_reused',proposal:true,line:L('Refused. That request id was already used for a different command.')},
 {reason:'not_found',proposal:true,line:L('Refused. No such war.')},
 {reason:'war_ended',proposal:true,line:L('Refused. That war has already ended.')},
 {reason:'not_a_party',proposal:true,line:L('Refused. Your nation is not a party to that war.')},
 {reason:'bad_squares',proposal:true,line:L(`Refused. Cede ${squares} distinct squares.`)},
 {reason:'square_not_cedable',proposal:true,line:L('Refused. Only Frontier squares your nation governs, never privately owned.')},
 {reason:'ending_pending',proposal:true,line:L('Refused. An ending of this war is already awaiting ratification.')},
];
export function endingRefusalFor(reason:string){return endingRefusals.find(x=>x.reason===reason);}
