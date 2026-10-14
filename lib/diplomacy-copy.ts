/** Treaty status, ratification news and Foreign affairs panel copy for Kindle, Korund and Aurelle (issue #313,
 * companion to SDE #308). Content only: #308 owns treaty objects, ratification and the panel, and no UI imports this.
 * Canon: harimu-docs trade-diplomacy-sanctions §13.1 (every negotiator and ratifying body is AI; Kindle: the Assembly
 * ratifies treaties by 2/3 and trade deals by simple majority; Korund: the Chairman alone; Aurelle: royal decree),
 * §13.2 (non-aggression pact: no war declarations between signatories, a fixed term, and breaking it costs Legitimacy and
 * global Reputation; trade agreement: tariff reductions, quotas and guaranteed supply contracts), §13.5 (an accepted
 * draft goes to the nation's ratifying body; treaties are public on signature), and the three press voices: Kindle (#237,
 * plain and argumentative, Republic Wire Service), Korund State Media (#238/#244) and the Aurelle Court Gazette (#239).
 * Bylines match lib/press-templates.ts, as in lib/war-copy.ts (#315).
 *
 * Rules: no invented figures. The only quantity wording is the docs' own "two-thirds" (Kindle treaty vote) and "simple
 * majority" (Kindle trade vote). Terms appear only through {endsAt}; no vote counts, durations or penalty amounts, and
 * the break penalty is named without a number. No line implies human citizens vote on treaties: every ratifier is an AI
 * body. No real-world treaty, country or leader is named. Placeholders ({nationA}, {nationB}, {treaty}, {endsAt}) are
 * pre-formatted runtime strings capped by the shared name cap, which this module re-exports (COUP_NAME_MAX from
 * lib/palace-coup-copy.ts). Lines that speak for the Crown are AI-badged. All wording is new: `proposal: true`. */

export { COUP_NAME_MAX as DIPLOMACY_NAME_MAX } from './palace-coup-copy';

export const DIPLOMACY_PLACEHOLDERS=['{nationA}','{nationB}','{treaty}','{endsAt}'] as const;
export const DIPLOMACY_LABEL_MAX=40;
export const DIPLOMACY_BODY_MAX=140;

export type Line={text:string;proposal:true};
export type TreatyStatus='proposed'|'ratified'|'in-force'|'expired'|'broken';
export type TreatyKind='non-aggression'|'trade';
export type RatifyingNation='kindle'|'korund'|'aurelle';
export type RatificationKey='kindle:treaty'|'kindle:trade'|'korund:any'|'aurelle:any';
export type RatificationNews={key:RatificationKey;nationId:RatifyingNation;body:string;ratifier:string;aiBadge:boolean;proposal:true};

export const TREATY_STATUSES:readonly TreatyStatus[]=['proposed','ratified','in-force','expired','broken'];
export const RATIFICATION_KEYS:readonly RatificationKey[]=['kindle:treaty','kindle:trade','korund:any','aurelle:any'];
export const DIPLOMACY_BYLINES={
 kindle:{name:'Republic Wire Service',proposal:true},
 korund:{name:'Korund State Media',proposal:false},
 aurelle:{name:'Court Gazette',proposal:false},
} as const;

const L=(text:string):Line=>({text,proposal:true});

export const foreignAffairsPanel={
 header:'Foreign affairs',
 emptyState:'No treaties in force',
 aiNote:L('Every negotiator and ratifying body is an AI.'),
 proposal:true,
} as const;

/** One line per kind of treaty, from §13.2. `name` is the pre-formatted {treaty} value #308 is expected to pass. */
export const treatyKinds:Readonly<Record<TreatyKind,{name:string;effect:Line}>>={
 'non-aggression':{name:'non-aggression pact',effect:L('No war declarations between the signatories.')},
 trade:{name:'trade agreement',effect:L('Tariff reductions, quotas and guaranteed supply contracts.')},
};

/** Status lines, 2 variants each, for either treaty kind via {treaty}. Terms only through {endsAt}. */
export const treatyStatusLines:Readonly<Record<TreatyStatus,readonly Line[]>>={
 proposed:[
  L('Proposed: {treaty} between {nationA} and {nationB}.'),
  L('{nationA} has proposed a {treaty} to {nationB}. It awaits ratification.'),
 ],
 ratified:[
  L('Ratified: {treaty} between {nationA} and {nationB}.'),
  L('The {treaty} between {nationA} and {nationB} has been ratified.'),
 ],
 'in-force':[
  L('In force until {endsAt}: {treaty} between {nationA} and {nationB}.'),
  L('The {treaty} between {nationA} and {nationB} is in force until {endsAt}.'),
 ],
 expired:[
  L('Expired {endsAt}: {treaty} between {nationA} and {nationB}.'),
  L('The {treaty} between {nationA} and {nationB} has expired.'),
 ],
 broken:[
  L('Broken: {treaty} between {nationA} and {nationB}.'),
  L('The {treaty} between {nationA} and {nationB} was broken.'),
 ],
};

/** One line for a broken non-aggression pact: names the cost, never a number (§13.2). */
export const brokenPactLine=L('The pact between {nationA} and {nationB} was broken. Breaking it costs Legitimacy and global Reputation.');

/** Ratification news: each names its own ratifying body (§13.1). The Kindle Assembly has one variant for the treaty vote and one for
 * the trade vote. Headlines are fixed (no placeholder) so they stay within 40 characters at any name length. */
export const ratificationNews:readonly RatificationNews[]=[
 {key:'kindle:treaty',nationId:'kindle',ratifier:'Assembly',aiBadge:false,proposal:true,
  body:'The Assembly ratified the {treaty} between {nationA} and {nationB} by a two-thirds vote.'},
 {key:'kindle:trade',nationId:'kindle',ratifier:'Assembly',aiBadge:false,proposal:true,
  body:'The Assembly ratified the {treaty} between {nationA} and {nationB} by a simple majority.'},
 {key:'korund:any',nationId:'korund',ratifier:'Chairman',aiBadge:false,proposal:true,
  body:'Korund State Media reports: the Chairman has ratified the {treaty} with {nationB}.'},
 {key:'aurelle:any',nationId:'aurelle',ratifier:'Crown',aiBadge:true,proposal:true,
  body:'Be it known: the Crown ratifies the {treaty} with {nationB} by royal decree.'},
];
export const ratificationHeadlines:Readonly<Record<RatificationKey,string>>={
 'kindle:treaty':'The Assembly ratifies a treaty',
 'kindle:trade':'The Assembly ratifies a trade deal',
 'korund:any':'The Chairman ratifies a treaty',
 'aurelle:any':'A treaty by royal decree',
};

export function ratificationFor(key:RatificationKey){return ratificationNews.find(x=>x.key===key);}
