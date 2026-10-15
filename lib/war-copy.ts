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
 * Placeholders ({attacker}, {defender}, {casusBelli}, {endsAt}, {start}, {end}, {peaceLockEnds}) are runtime values capped by the shared
 * name cap, which this module re-exports (COUP_NAME_MAX from lib/palace-coup-copy.ts). Lines that speak for the Crown
 * are AI-badged. #381 (ARC, docs ui-ux 23.2): so are Korund State Media lines for the state's own war (`ours` and `against-us`), which speak
 * for the AI Chairman and Presidium; foreign-war (`world`) reports are not, like the Gazette's. All wording is new: `proposal: true`. */

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
   'Korund State Media reports: war is declared on {defender}. Mobilization lasts 48 real hours. One hammer, one heart.',true),
  'against-us':n('korund-against-us','War declared on Korund',
   'Korund State Media reports: {attacker} declares war over {casusBelli}. Brigades hold for 48 real hours.',
   'Korund State Media reports: {attacker} has declared war. Brigades hold the plan for 48 real hours.',true),
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

/** Mobilization-ended news (#334, companion to #309): one notice per side in each nation's voice, with the same bylines as the
 * declaration notices. Placeholders: {attacker}, {defender} only. Aurelle "Be it known" lines speak for the Crown and, since #381, Korund `ours` and
 * `against-us` State Media lines speak for the Chairman and Presidium; both are AI-badged. Kindle, Korund `world` and Gazette-report lines are not. The assault line repeats §15.3 ("cities and forts", only inside the defender's window). */
export type MobilizationEndedNotice={id:string;headline:string;body:string;aiBadge:boolean;proposal:true};
export type MobilizationEndedNotices={nationId:WarNation;byline:{name:string;proposal:boolean};notices:Readonly<Record<DeclarationSide,MobilizationEndedNotice>>;proposal:true};
const m=(id:string,headline:string,body:string,aiBadge=false):MobilizationEndedNotice=>({id,headline,body,aiBadge,proposal:true});
export const mobilizationEndedNotices:readonly MobilizationEndedNotices[]=[
 {nationId:'kindle',byline:{name:'Republic Wire Service',proposal:true},proposal:true,notices:{
  ours:m('kindle-end-ours','Mobilization is over','The 48 real hours are up. The war on {defender} is active. Officials must say what comes next.'),
  'against-us':m('kindle-end-against-us','The war on the Republic is active','{attacker}\'s 48 real hours are up. The war is active. Assaults on cities and forts resolve only in our defense window.'),
  world:m('kindle-end-world','A war is now active','{attacker} and {defender} have finished mobilizing. The war is active.')}},
 {nationId:'korund',byline:{name:'Korund State Media',proposal:false},proposal:true,notices:{
  ours:m('korund-end-ours','Mobilization is complete','Korund State Media reports: mobilization against {defender} is complete. The war is active. One hammer, one heart.',true),
  'against-us':m('korund-end-against-us','The war on Korund is active','Korund State Media reports: {attacker}\'s mobilization is over. The war is active. Brigades hold the plan.',true),
  world:m('korund-end-world','War is active abroad','Korund State Media reports: {attacker} and {defender} have finished mobilizing. The war is active.')}},
 {nationId:'aurelle',byline:{name:'Court Gazette',proposal:false},proposal:true,notices:{
  ours:m('aurelle-end-ours','Mobilization is ended','Be it known: mobilization is ended. The realm is at war with {defender}. Every thread in its place.',true),
  'against-us':m('aurelle-end-against-us','The war upon the realm is active','Be it known: {attacker}\'s mobilization is ended. The war upon the realm is active.',true),
  world:m('aurelle-end-world','War is active beyond the realm','The Court Gazette reports that {attacker} and {defender} have ended mobilization. The war is active.')}},
];
export function endedNoticesFor(nationId:WarNation){return mobilizationEndedNotices.find(x=>x.nationId===nationId);}

/** War banner on both nations' Country view (#309). The countdown value comes from the runtime timer; the copy only frames it.
 * `header.ours` is for the nation that declared, `header.againstUs` for the nation declared upon; each names the other nation. */
export const warBanner={
 header:{ours:'At war with {defender}',againstUs:'At war with {attacker}'},
 countdownLabel:'Mobilized by {endsAt}',
 countdownCaption:L('Mobilization ends {endsAt}. No attack can begin before then.'),
 proposal:true,
} as const;

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

/** Active-war banner (#339, follow-up to #334/#335): the Country-view banner once the 48 real hours are up and the war is active.
 * Same other-nation-only naming as `warBanner.header` (`ours` is the nation that declared and names {defender}; `againstUs` is the
 * nation declared upon and names {attacker}); never both. It is a system banner, so it has no byline and no AI badge. `status` and
 * `detail` are the existing `mobilizationStatus.active` lines, reused word for word, so this adds no wording or figures of its own. */
export const activeWarBanner={
 header:{ours:'Active war with {defender}',againstUs:'Active war with {attacker}'},
 status:mobilizationStatus.active[1],
 detail:mobilizationStatus.active[0],
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
