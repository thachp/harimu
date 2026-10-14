/** War declaration, mobilization and defense-window notices for Kindle, Korund and Aurelle (issue #312, companion to
 * SDE #309 and #310). Content only: #309/#310 own declarations, the mobilization clock, the Founding Period, treaty
 * locks and defense windows, and no UI imports this. Canon: harimu-docs territory-cities-warfare §15.3 (a formal
 * declaration with a 48-real-hour mobilization period before any attack; both sides and the world are notified; a daily
 * 4-hour defense window; assaults on cities and forts resolve only inside the defender's window; open-field skirmishes on frontier
 * squares happen anytime but move control slowly), §15.4 (no declarations during a shard's first 30 days, the Founding
 * Period; citizens are never killed; homes and belongings are never looted), trade-diplomacy-sanctions §13.2 (a
 * non-aggression pact bars declarations) and the three press voices: Kindle (#237, plain and argumentative, Republic
 * Wire Service), Korund State Media (#238/#244) and the Aurelle Court Gazette (#239, "Be it known").
 *
 * Placeholders are pre-formatted strings filled at runtime; nothing here formats a time or a grievance. {casusBelli}
 * is a short plain-text label of the top grievance (§13.5 gate inputs); every declaration notice has a variant without
 * it. "wounded" appears only in the citizen-safety lines (§15.4).
 *
 * Rules: figures come only from the docs: 48 real hours (mobilization), the 4-hour defense window and the 30-day
 * Founding Period; everything else is a runtime placeholder. The peace-treaty lock length is a docs [ASSUMPTION] and is
 * not written in. Blocked declarations give reasons, never threats. Nothing glorifies war or names a real country,
 * leader or conflict, and no line threatens a named player. No armies, battles, casualties or loot; no "Notable".
 * Placeholders ({attacker}, {defender}, {casusBelli}, {endsAt}, {start}, {end}) are runtime values capped by the shared
 * name cap, which this module re-exports (COUP_NAME_MAX from lib/palace-coup-copy.ts). Lines that speak for the Crown
 * are AI-badged. All wording is new: `proposal: true`. */

export { COUP_NAME_MAX as WAR_NAME_MAX } from './palace-coup-copy';

/** All placeholders are pre-formatted strings filled at runtime; this copy formats nothing. {casusBelli} is a short plain-text
 * label of the declaration's top grievance (the casus belli gate's inputs, §13.5: border incidents, broken treaties,
 * sanctions, Commons disputes). {peaceLockEnds} is when a peace treaty's declaration lock ends (the lock length is a docs
 * [ASSUMPTION], so no number is written). */
export const WAR_PLACEHOLDERS=['{attacker}','{defender}','{casusBelli}','{endsAt}','{start}','{end}','{peaceLockEnds}'] as const;
export const WAR_LABEL_MAX=40;
export const WAR_BODY_MAX=140;

export type Line={text:string;proposal:true};
export type WarNation='kindle'|'korund'|'aurelle';
export type DeclarationSide='ours'|'against-us'|'world';
/** `body` names the grievance ({casusBelli}); `bodyNoGrievance` is the variant for a declaration with no grievance label. */
export type WarNotice={id:string;headline:string;body:string;bodyNoGrievance:string;aiBadge:boolean;proposal:true};
export type WarNationNotices={nationId:WarNation;byline:{name:string;proposal:boolean};notices:Readonly<Record<DeclarationSide,WarNotice>>;proposal:true};

export const WAR_NATIONS:readonly WarNation[]=['kindle','korund','aurelle'];
export const DECLARATION_SIDES:readonly DeclarationSide[]=['ours','against-us','world'];

const L=(text:string):Line=>({text,proposal:true});
const n=(id:string,headline:string,body:string,bodyNoGrievance:string,aiBadge=false):WarNotice=>({id,headline,body,bodyNoGrievance,aiBadge,proposal:true});

/** Declaration notices in each nation's own voice. Mobilization is 48 real hours before any attack (docs §15.3). */
export const declarationNotices:readonly WarNationNotices[]=[
 {nationId:'kindle',byline:{name:'Republic Wire Service',proposal:true},proposal:true,notices:{
  ours:n('kindle-ours','{attacker} declares war',
   'War on {defender}, citing {casusBelli}. Nothing can happen for 48 real hours. Officials must say why.',
   'War on {defender}, with no grievance given. Nothing can happen for 48 real hours. Officials must say why.'),
  'against-us':n('kindle-against-us','War declared on the Republic',
   '{attacker} cites {casusBelli}. No attack can come for 48 real hours. Ask your officials what comes next.',
   '{attacker} gives no grievance. No attack can come for 48 real hours. Ask your officials what comes next.'),
  world:n('kindle-world','A war has been declared',
   '{attacker} declares war on {defender}, citing {casusBelli}. Both sides mobilize for 48 real hours.',
   '{attacker} declares war on {defender}. Both sides mobilize for 48 real hours before any attack.')}},
 {nationId:'korund',byline:{name:'Korund State Media',proposal:false},proposal:true,notices:{
  ours:n('korund-ours','The state declares war',
   'Korund State Media reports: war on {defender}, for {casusBelli}. Mobilization lasts 48 real hours.',
   'Korund State Media reports: war is declared on {defender}. Mobilization lasts 48 real hours. One hammer, one heart.'),
  'against-us':n('korund-against-us','War declared on Korund',
   'Korund State Media reports: {attacker} declares war over {casusBelli}. Brigades hold for 48 real hours.',
   'Korund State Media reports: {attacker} has declared war. Brigades hold the plan for 48 real hours.'),
  world:n('korund-world','War declared abroad',
   'State Media: {attacker} declares war on {defender} over {casusBelli}. Mobilizing: 48 real hours.',
   'Korund State Media reports: {attacker} has declared war on {defender}. Mobilization lasts 48 real hours.')}},
 {nationId:'aurelle',byline:{name:'Court Gazette',proposal:false},proposal:true,notices:{
  ours:n('aurelle-ours','The Crown declares war',
   'Be it known: the Crown declares war upon {defender}, for {casusBelli}. Mobilization runs 48 real hours.',
   'Be it known: the Crown declares war upon {defender}. Mobilization runs 48 real hours. Every thread in its place.',true),
  'against-us':n('aurelle-against-us','War is declared upon the realm',
   'Be it known: {attacker} declares war upon the realm, citing {casusBelli}. The Crown mobilizes for 48 real hours.',
   'Be it known: {attacker} has declared war upon the realm. The Crown mobilizes for 48 real hours.',true),
  world:n('aurelle-world','War declared beyond the realm',
   'Court Gazette: {attacker} declares war on {defender}, for {casusBelli}. Mobilizing: 48 real hours.',
   'The Court Gazette reports that {attacker} has declared war on {defender}. Mobilization runs 48 real hours.')}},
];

export const mobilizationStatus={
 mobilizing:[
  L('Mobilization is under way. No attack can begin before {endsAt}.'),
  L('Both sides are mobilizing until {endsAt}.'),
 ],
 active:[
  L('The war is active. Assaults on cities and forts can resolve only inside the defender\'s defense window.'),
  L('Mobilization is over and the war is active.'),
 ],
 /** Two endings: a ceasefire or peace treaty (treaty terms apply; the declaration lock follows a peace treaty, §13.2), and a
  * generic line for any other ending. The generic line is proposal wording: #309 decides which other endings exist. */
 ended:{
  treaty:L('The war has ended by ceasefire or peace treaty. Its terms apply, and a peace treaty locks declarations until {peaceLockEnds}.'),
  other:L('The war has ended.'),
 },
 proposal:true,
} as const;

/** Reasons a declaration was refused, for the AI-leader log and news. Reasons, not threats. */
export const blockedDeclaration={
 foundingPeriod:L('The declaration was not made. War cannot be declared during the Founding Period, a shard\'s first 30 days.'),
 nonAggression:L('The declaration was not made. A non-aggression pact with {defender} is in force.'),
 peaceLock:L('The declaration was not made. A recent peace treaty with {defender} keeps declarations locked.'),
 proposal:true,
} as const;

export const defenseWindow={
 /** Country view line; a full line, not a label, since both times are runtime values. */
 line:L('Defense window: {start}–{end} your time'),
 explainer:[
  L('Assaults on cities and forts resolve only inside the defender\'s daily 4-hour defense window.'),
  L('Open-field skirmishes on frontier squares can happen anytime, but they move control only slowly.'),
 ],
 proposal:true,
} as const;

export const citizenSafety={
 lines:[
  L('Citizens are never killed in war. Homes and personal belongings are never looted.'),
  L('Soldiers put out of action are wounded, not killed.'),
 ],
 proposal:true,
} as const;

export function noticesFor(nationId:WarNation){return declarationNotices.find(x=>x.nationId===nationId);}
