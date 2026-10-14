/** Nation-specific Notable topics for all 10 nations (issue #111, gap 3).
 * Same shape as notableTopics in lib/notable-profiles.ts ({label,question,authored}). INACTIVE: validNotableCommand
 * only accepts the generic notableTopics keys, so nothing here is served until the route and dialog support per-nation topics.
 * Every authored answer cites public records only and states what a conversation cannot do.
 * MVP nations repeat proposedNationTopics (lib/notable-roster.ts) verbatim, kept in sync by test, and add one topic each.
 * Self-contained so tests can import it directly.
 * Source: culture bible, thachp/harimu-docs content/world/culture-bible.mdx. */
export type NationTopic={label:string;question:string;authored:string};
export type TopicNation='kindle'|'korund'|'aurelle'|'confluence'|'meridian'|'ilmar'|'hoarvale'|'varkand'|'veldwood'|'fulmara';
export const nationTopicsStatus='inactive' as const;

export const nationNotableTopics:Readonly<Record<TopicNation,Readonly<Record<string,NationTopic>>>>={
 kindle:{elections:{label:'Elections',question:'How do Kindle elections work?',authored:'Citizens rank AI candidates on the published ballot. Humans never hold office, and a conversation cannot change a ballot.'},prices:{label:'Price boards',question:'How should I read the price boards?',authored:'Posted prices are public records. Compare boards before you trade; a Notable cannot set a price.'},
  'second-chances':{label:'Second chances',question:'What does the Emberwarden rank recognize?',authored:'Emberwarden is a civic rank shown on your public record after recorded service. A Notable cannot award or remove a rank.'}},
 korund:{rations:{label:'Rations',question:'How do ration coupons work?',authored:'Coupons are issued by the plan under published ration rules and expire. Redeem them in Market before they lapse; a Notable cannot issue coupons.'},quotas:{label:'Quotas',question:'What does the quota mean for me?',authored:'Your quota is publicly recorded shift by shift. Completed settlements count; an underway shift does not, and a conversation cannot change a quota.'},
  'plan-day':{label:'Plan Day',question:'What happens on Plan Day?',authored:'Plan Day publishes brigade results and the next plan targets. Presidium deliberations are not public, and a conversation cannot change a target.'}},
 aurelle:{favor:{label:'Royal Favor',question:'How is Royal Favor earned?',authored:'Royal Favor rises with publicly recorded service, as shown in your Aurelle plan panel. No conversation can grant it.'},decrees:{label:'Decrees',question:'How do I read a royal decree?',authored:'Decrees are published in the Court Gazette. Council deliberations are not public, and a Notable cannot change a decree.'},
  'kinward-rite':{label:'Kinward Rite',question:'What is the Kinward Rite?',authored:'The Kinward Rite keeps public name-stones of oaths and lineage. Its customs are published; a conversation cannot change your faith, rank or standing at court.'}},
 confluence:{
  'cooperative-ledger':{label:'Cooperative ledgers',question:'How do I read a cooperative ledger?',authored:'Terrace cooperatives publish their ledgers and price bands. Party decisions are not public, and a conversation cannot change your share.'},
  'bread-halls':{label:'Bread halls',question:'What do the Open Hand bread halls do?',authored:'Bread halls run by registered Almoners publish what they serve. A Notable cannot grant food or register a congregation.'}},
 meridian:{
  'rising-by-measure':{label:'Rising by measure',question:'How do exams affect rank?',authored:'Exam results and rank rules are posted publicly. A Notable cannot change a result, your rank or your Party Standing.'},
  'sez-licenses':{label:'SEZ licenses',question:'How does licensing work in Tsenga SEZ?',authored:'License rules and review dates are published. Standing Committee reasoning is not public, and a conversation cannot grant a license or permit.'},
  campaigns:{label:'Anti-corruption campaigns',question:'What do announced campaigns mean?',authored:'Only announced cases and published audits are public. Open investigations are not public, and a Notable cannot speculate about them.'}},
 ilmar:{
  'clear-measure':{label:'Clear Measure',question:'Why are there profit shares instead of interest?',authored:'Under Clear Measure, endowments post profit shares through Lightshare. Accounts are public; speaking with a Notable grants no Prisms or shares.'},
  piety:{label:'Piety',question:'How is Piety recorded?',authored:'Piety follows published Canon duties. Guardian Synod judgments are not public, and a conversation cannot change your Piety or standing.'}},
 hoarvale:{
  'moot-votes':{label:'Moot votes',question:'How do Moot coalitions work?',authored:'Moot votes and coalition agreements are published. Private negotiations are not public, and a Notable cannot change a vote.'},
  'inflation-band':{label:'The Rime',question:'Why is the Rime kept boring?',authored:'Mint & Reserve publishes the inflation band it targets. Nobody can predict policy here, and a conversation cannot change your Rime.'}},
 varkand:{
  'alert-levels':{label:'Alert Levels',question:'What do Alert Levels change?',authored:'The current Alert Level and its published rules apply to everyone. Directorate deliberations are not public, and a conversation cannot change the level.'},
  'national-service':{label:'National Service',question:'What happens in National Service?',authored:'National Service rules, including the first seven days, are published. A Notable cannot grant passes, ranks or exemptions.'}},
 veldwood:{
  'ring-moot':{label:'Ring Moot',question:'How does a Grove initiative pass?',authored:'Grove votes and initiative rules are published, and every voice in the ring is heard. A conversation cannot sign, count or decide anything.'},
  'wage-accords':{label:'Wage Accords',question:'What are the Wage Accords?',authored:'Yearly Wage Accord terms are published after negotiation. A Notable cannot change your wage or call a strike.'}},
 fulmara:{
  'share-register':{label:'Share register',question:'How do I read the share register?',authored:'The share register and house charters are public. This is not advice; a Notable cannot sell shares or sway the Grand Council.'},
  exchange:{label:'The Exchange',question:'What moves Charge and Toll Coupon prices?',authored:'Exchange prices are published, with the owning house disclosed. This is not advice, and a conversation cannot move a market.'}},
};
