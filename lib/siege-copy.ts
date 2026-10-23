/** Siege progress, assault outcome and city-captured copy for Kindle, Korund and Aurelle (issue #420, companion to the siege PoC and to
 * lib/war-copy.ts #312/#334/#339). Content only: the siege code owns assaults, the two-day rule and capture, and no UI imports this.
 * Canon: harimu-docs territory-cities-warfare §15.3 (capturing a city takes at least two successful assaults on two different days inside
 * the defender's defense window; Heartland squares cannot be captured), cities §capture rules (capitals and other Heartland cities can
 * never be captured; Frontier outposts and cities founded on Frontier squares can be), §15.4 (citizens are never killed; evacuation is
 * covered by the separate war-protections copy, #421) and the three press voices: Kindle (#237, Kindle Press, plain and argumentative),
 * Korund State Media (#238/#244) and the Aurelle Court Gazette (#239, "Be it known"). Bylines are checked against lib/press-templates.ts.
 *
 * Each nation has two variants of every siege event: a `report` (a bylined report about a siege between other nations, or about one in
 * which the nation is not the voice) and an `own` line in the nation's own voice, written to read the same for either side. Badge rule
 * (#381, ui-ux §23.2): Aurelle "Be it known" lines and Korund State Media lines for the state's own siege speak for an AI leader or body, so
 * `own` is AI-badged for them; the Kindle lines and every `report` are not. The strip caption, the rules lines and the two private notices
 * are system lines with no byline and no badge.
 *
 * Rules: placeholders only for {city}, {attacker}, {defender} and {n}. The only figures are the docs' two assaults on two different days
 * (as the word "two" and as the "2" in the caption the issue specifies). No control share, strength, troop count, assault odds or timer;
 * no progress meter besides {n} of 2. A capital is never described as capturable. Nothing is graphic, and citizens are never killed. {city},
 * {attacker} and {defender} are runtime values capped by the shared name cap, which this module re-exports (COUP_NAME_MAX from
 * lib/palace-coup-copy.ts); {n} is a single count. Limits: headlines 40, bodies and lines 140, tested with the name placeholders filled to
 * 24 characters. All wording is new: `proposal: true`. */

export { COUP_NAME_MAX as SIEGE_NAME_MAX } from './palace-coup-copy';

export const SIEGE_PLACEHOLDERS=['{city}','{attacker}','{defender}','{n}'] as const;
export const SIEGE_HEADLINE_MAX=40;
export const SIEGE_BODY_MAX=140;

export type Line={text:string;proposal:true};
export type SiegeNation='kindle'|'korund'|'aurelle';
export type SiegeEvent='opened'|'first-assault'|'city-falls'|'assault-held'|'lifted';
export type SiegeVariant='report'|'own';
export type SiegeNotice={id:string;headline:string;body:string;aiBadge:boolean;proposal:true};
export type SiegeNationNotices={nationId:SiegeNation;byline:{name:string;proposal:boolean};notices:Readonly<Record<SiegeEvent,Readonly<Record<SiegeVariant,SiegeNotice>>>>;proposal:true};

export const SIEGE_NATIONS:readonly SiegeNation[]=['kindle','korund','aurelle'];
export const SIEGE_EVENTS:readonly SiegeEvent[]=['opened','first-assault','city-falls','assault-held','lifted'];
export const SIEGE_VARIANTS:readonly SiegeVariant[]=['report','own'];

const L=(text:string):Line=>({text,proposal:true});
const s=(id:string,headline:string,body:string,aiBadge=false):SiegeNotice=>({id,headline,body,aiBadge,proposal:true});

export const siegeNotices:readonly SiegeNationNotices[]=[
 {nationId:'kindle',byline:{name:'Kindle Press',proposal:false},proposal:true,notices:{
  opened:{
   report:s('kindle-opened-report','Siege opens at {city}','Kindle Press: {attacker} lays siege to {city}. Taking it needs two successful assaults on two days.'),
   own:s('kindle-opened-own','Siege begins at {city}','Kindle Press: the siege of {city} is on. Officials must tell citizens what it means.')},
  'first-assault':{
   report:s('kindle-first-report','First assault succeeds','Kindle Press: {attacker}\'s assault on {city} succeeded. A second, on another day, is needed.'),
   own:s('kindle-first-own','A first assault lands','Kindle Press: the first assault on {city} has succeeded. A second is needed, on another day.')},
  'city-falls':{
   report:s('kindle-falls-report','{city} has fallen','Kindle Press: {city} has fallen to {attacker}. Its citizens are evacuated.'),
   own:s('kindle-falls-own','The siege is over','Kindle Press: {city} is captured after a second assault. Ask your officials what comes next.')},
  'assault-held':{
   report:s('kindle-held-report','Assault held at {city}','Kindle Press: {defender} held {city}. The assault did not succeed.'),
   own:s('kindle-held-own','{city} holds','Kindle Press: the assault on {city} was turned back. The siege goes on.')},
  lifted:{
   report:s('kindle-lifted-report','Siege lifted at {city}','Kindle Press: {attacker} lifts the siege of {city}. The city was not captured.'),
   own:s('kindle-lifted-own','No capture at {city}','Kindle Press: the siege of {city} is over, and the city stands. Officials must say why.')}}},
 {nationId:'korund',byline:{name:'Korund State Media',proposal:false},proposal:true,notices:{
  opened:{
   report:s('korund-opened-report','Siege abroad','Korund State Media reports: {attacker} has laid siege to {city}.'),
   own:s('korund-opened-own','Siege begins at {city}','Korund State Media reports: the siege of {city} has begun. Brigades hold the plan.',true)},
  'first-assault':{
   report:s('korund-first-report','Assault abroad','Korund State Media reports: {attacker}\'s assault on {city} succeeded. A second, on another day, is needed.'),
   own:s('korund-first-own','The first assault succeeds','Korund State Media reports: the first assault on {city} has succeeded. A second is needed. The plan advances.',true)},
  'city-falls':{
   report:s('korund-falls-report','{city} falls abroad','Korund State Media reports: {city} has fallen to {attacker}. Its citizens are evacuated.'),
   own:s('korund-falls-own','The siege is complete','Korund State Media reports: {city} is taken after a second assault. Order is kept.',true)},
  'assault-held':{
   report:s('korund-held-report','An assault is held','Korund State Media reports: {defender} has held {city}. The assault did not succeed.'),
   own:s('korund-held-own','The assault is held','Korund State Media reports: the assault on {city} was held. The siege continues. Brigades hold the plan.',true)},
  lifted:{
   report:s('korund-lifted-report','A siege is lifted','Korund State Media reports: {attacker} has lifted the siege of {city}. The city was not captured.'),
   own:s('korund-lifted-own','The siege is lifted','Korund State Media reports: the siege of {city} is lifted. The city was not captured. The plan holds.',true)}}},
 {nationId:'aurelle',byline:{name:'Court Gazette',proposal:false},proposal:true,notices:{
  opened:{
   report:s('aurelle-opened-report','A siege beyond the realm','The Court Gazette reports that {attacker} has laid siege to {city}.'),
   own:s('aurelle-opened-own','Siege begins at {city}','Be it known: the siege of {city} is begun. Every thread in its place.',true)},
  'first-assault':{
   report:s('aurelle-first-report','An assault beyond the realm','The Court Gazette reports {attacker}\'s assault on {city} succeeded. A second, on another day, is needed.'),
   own:s('aurelle-first-own','The first assault succeeds','Be it known: the first assault on {city} succeeded. A second, on another day, is needed.',true)},
  'city-falls':{
   report:s('aurelle-falls-report','A city falls abroad','The Court Gazette reports that {city} has fallen to {attacker}. Its citizens are evacuated.'),
   own:s('aurelle-falls-own','The siege is ended','Be it known: {city} is taken after a second assault. Let the realm be calm.',true)},
  'assault-held':{
   report:s('aurelle-held-report','An assault is held','The Court Gazette reports that {defender} has held {city}. The assault did not succeed.'),
   own:s('aurelle-held-own','The assault is held','Be it known: the assault on {city} is held. The siege continues.',true)},
  lifted:{
   report:s('aurelle-lifted-report','A siege is lifted','The Court Gazette reports that {attacker} has lifted the siege of {city}. The city was not captured.'),
   own:s('aurelle-lifted-own','The siege is lifted','Be it known: the siege of {city} is lifted. The city was not captured.',true)}}},
];
export function siegeNoticesFor(nationId:SiegeNation){return siegeNotices.find(x=>x.nationId===nationId);}

/** Status strip caption. {n} is the runtime count of successful assault days; it is the only progress shown (the docs' two-day rule). */
export const siegeStrip={
 caption:L('Siege of {city}: {n} of 2 successful assault days'),
 proposal:true,
} as const;

/** Rules lines (system voice): the two-day rule, and which cities can and cannot be captured. */
export const siegeRules={
 lines:[
  L('A city falls only after at least two successful assaults on two different days, inside its defense window.'),
  L('Capitals and other Heartland cities can never be captured.'),
  L('Frontier outposts and cities founded on Frontier squares can be captured.'),
 ],
 proposal:true,
} as const;

/** Private notices: the defender's city fell; the attacker's nation took a city. System lines, no byline, no badge. */
export const capturePrivate={
 defender:L('Your city, {city}, has fallen to {attacker}.'),
 attacker:L('Your nation took {city} from {defender}.'),
 proposal:true,
} as const;
