/** AI-leader treaty proposal announcements (issue #440, companion to #400 / #418). Content only: lib/diplomacy.ts owns `runAiTreatyProposals`
 * and the proposals themselves, and no UI imports this. Break notices and the NAP-blocked war refusal live in the separate treaty-break copy module (#435),
 * not here. Canon: harimu-docs trade-diplomacy-sanctions §13.1 (every ratifier is an AI body) and §13.2 (a non-aggression pact bars war
 * declarations between the signatories; a trade agreement brings tariff reductions, quotas and supply contracts), ai-leadership and the
 * §13.1 table of AI negotiators (Kindle's President and Secretary of State, Korund's Chairman and Aurelle's Crown; the server's
 * `treatyAiLeaders` labels Kindle's leader "AI Cabinet", but the docs titles are used here) and the three press
 * voices (Republic Wire Service, Korund State Media, Court Gazette; bylines are checked against lib/press-templates.ts). Wording differs from
 * the status lines in lib/diplomacy-copy.ts, which this does not replace.
 *
 * Each nation has an announcement for both treaty kinds (non-aggression pact, trade agreement) in two roles. `proposer`: our AI leader
 * proposes to another nation ({other}); the leader speaks, so the line is AI-badged. `recipient`: another nation's AI leader proposes to
 * us ({proposer}); the national outlet reports it, so the line carries a byline and no badge. #381 / ui-ux §23.2: lines that speak for an AI
 * leader are badged (the President's and Secretary of State's statement, the Chairman's own act in State Media, the Crown's "Be it known"); bylined reports about a
 * foreign leader are not. `proposedBy` is a plain system line for the Foreign affairs panel: the leader label comes in through {leader}.
 *
 * Rules: no digits and no number words, no penalties or costs, and no promise of the outcome (a proposal only awaits ratification; nothing
 * says it will be accepted). Placeholders ({proposer}, {other}, {treaty}, {leader}) are runtime values capped by the shared name cap, which
 * this module re-exports (COUP_NAME_MAX from lib/palace-coup-copy.ts). Limits: labels and headlines 40, lines 80, news bodies 140, tested
 * with every placeholder filled to 24 characters. All wording is new: `proposal: true`. */

export { COUP_NAME_MAX as AI_PROPOSAL_NAME_MAX } from './palace-coup-copy';

export const AI_PROPOSAL_PLACEHOLDERS=['{proposer}','{other}','{treaty}','{leader}'] as const;
export const AI_PROPOSAL_LABEL_MAX=40;
export const AI_PROPOSAL_LINE_MAX=80;
export const AI_PROPOSAL_BODY_MAX=140;

export type Line={text:string;proposal:true};
export type ProposalNation='kindle'|'korund'|'aurelle';
export type ProposalKind='non-aggression'|'trade';
export type ProposalRole='proposer'|'recipient';
export type ProposalNotice={id:string;headline:string;body:string;aiBadge:boolean;proposal:true};
export type ProposalNationNews={nationId:ProposalNation;byline:{name:string;proposal:boolean};notices:Readonly<Record<ProposalRole,Readonly<Record<ProposalKind,ProposalNotice>>>>;proposal:true};

export const PROPOSAL_NATIONS:readonly ProposalNation[]=['kindle','korund','aurelle'];
export const PROPOSAL_KINDS:readonly ProposalKind[]=['non-aggression','trade'];
export const PROPOSAL_ROLES:readonly ProposalRole[]=['proposer','recipient'];

const L=(text:string):Line=>({text,proposal:true});

/** Plain system line for the Foreign affairs panel: which AI leader made the proposal. No byline, no badge. */
export const proposedBy={
 label:'Proposed by',
 line:L('Proposed by {leader}.'),
 proposal:true,
} as const;

const p=(id:string,headline:string,body:string,aiBadge=false):ProposalNotice=>({id,headline,body,aiBadge,proposal:true});
/** Proposal announcements. `proposer`: our leader proposes to {other} (badged). `recipient`: {proposer} proposes to us (reported, not badged). */
export const aiProposalNews:readonly ProposalNationNews[]=[
 {nationId:'kindle',byline:{name:'Republic Wire Service',proposal:true},proposal:true,notices:{
  proposer:{
   'non-aggression':p('kindle-proposer-non-aggression','The President proposes a pact','President and Secretary of State: we propose a {treaty} to {other}. It awaits ratification.',true),
   trade:p('kindle-proposer-trade','The President proposes a trade deal','President and Secretary of State: we propose a {treaty} to {other}. It awaits ratification.',true)},
  recipient:{
   'non-aggression':p('kindle-recipient-non-aggression','A pact is offered to the Republic','Republic Wire Service: {proposer} proposes a {treaty} to the Republic. It awaits ratification.'),
   trade:p('kindle-recipient-trade','A trade deal is offered','Republic Wire Service: {proposer} proposes a {treaty} to the Republic. It awaits ratification.')}}},
 {nationId:'korund',byline:{name:'Korund State Media',proposal:false},proposal:true,notices:{
  proposer:{
   'non-aggression':p('korund-proposer-non-aggression','The Chairman offers a pact','Korund State Media reports: the Chairman offers {other} a {treaty}. It would bar war between them.',true),
   trade:p('korund-proposer-trade','The Chairman offers a trade deal','Korund State Media reports: the Chairman offers {other} a {treaty}. It would open trade between them.',true)},
  recipient:{
   'non-aggression':p('korund-recipient-non-aggression','A pact is offered to Korund','Korund State Media reports: {proposer} offers Korund a {treaty}. It awaits ratification.'),
   trade:p('korund-recipient-trade','A trade deal is offered to Korund','Korund State Media reports: {proposer} offers Korund a {treaty}. It awaits ratification.')}}},
 {nationId:'aurelle',byline:{name:'Court Gazette',proposal:false},proposal:true,notices:{
  proposer:{
   'non-aggression':p('aurelle-proposer-non-aggression','The Crown offers a pact','Be it known: the Crown offers {other} a {treaty}, that war may be barred between the realms.',true),
   trade:p('aurelle-proposer-trade','The Crown offers a trade deal','Be it known: the Crown offers {other} a {treaty}, that trade may flow between the realms.',true)},
  recipient:{
   'non-aggression':p('aurelle-recipient-non-aggression','A pact is offered to the realm','The Court Gazette reports that {proposer} offers the realm a {treaty}. It awaits ratification.'),
   trade:p('aurelle-recipient-trade','A trade deal is offered to the realm','The Court Gazette reports that {proposer} offers the realm a {treaty}. It awaits ratification.')}}},
];
export function aiProposalNewsFor(nationId:ProposalNation){return aiProposalNews.find(x=>x.nationId===nationId);}
