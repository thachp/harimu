/** War weariness copy (issue #434, companion to #423; folds in #438's per-nation banner wording and home-front news). Content only: #423
 * owns the weekly Unrest step and the levels, and no UI imports this. Canon: harimu-docs territory-cities-warfare §15.3 (War weariness:
 * every game week at war adds Unrest, more in Kindle, less in Korund, and casualties and lost squares accelerate it), trade-diplomacy
 * §13 (Kindle's AI legislature weighs war-weariness polls), the Kindle, Korund and Aurelle press voices (Republic Wire Service, Korund
 * State Media, Court Gazette; bylines are checked against lib/press-templates.ts) and ai-leadership (the Crown and the Chairman speak
 * for the state). The docs give only the weekly addition and what speeds it up, so no band, threshold or amount is written, and the
 * relief line says only that weariness no longer grows once the war is over.
 *
 * Voice: Kindle is frank (press and polls). Korund State Media never admits weariness: it frames the strain as "resolve being tested", and
 * no Korund-facing line (banners, news, the "Resolve" label, the weekly notices and the tooltip, which all avoid the word) says the
 * population is tired of the war. The Court Gazette speaks of the Crown's patience and the realm's burden. #381 / ui-ux §23.2: Korund
 * State Media news for the state's own war speaks for the Chairman and Presidium, and the Crown's "Be it known" line speaks for the AI
 * Monarch, so both are AI-badged; Kindle lines and the Gazette's own reports are not. Banners, the strip, the tooltip, the weekly notice
 * and the relief lines are system lines with no byline and no badge.
 *
 * Rules: no digits and no number words. The Unrest amount and the level word come only through {amount} and {band}, pre-formatted
 * strings; the three levels (rising, high, severe) are names only, with no thresholds. Limits: labels and banners 40, headlines 40, lines 80,
 * news bodies 140, tested with every placeholder filled to the shared 24-character name cap, which this module re-exports (COUP_NAME_MAX
 * from lib/palace-coup-copy.ts). Nothing is graphic: citizens are never killed (§15.4). All wording is new: `proposal: true`. */

export { COUP_NAME_MAX as WEARINESS_NAME_MAX } from './palace-coup-copy';

export const WEARINESS_PLACEHOLDERS=['{amount}','{band}'] as const;
export const WEARINESS_LABEL_MAX=40;
export const WEARINESS_LINE_MAX=80;
export const WEARINESS_BODY_MAX=140;

export type Line={text:string;proposal:true};
export type WearinessNation='kindle'|'korund'|'aurelle';
export type WearinessLevel='rising'|'high'|'severe';
export type WearinessNotice={id:string;headline:string;body:string;aiBadge:boolean;proposal:true};
export type WearinessNationNews={nationId:WearinessNation;byline:{name:string;proposal:boolean};notices:Readonly<Record<WearinessLevel,WearinessNotice>>;proposal:true};

export const WEARINESS_NATIONS:readonly WearinessNation[]=['kindle','korund','aurelle'];
export const WEARINESS_LEVELS:readonly WearinessLevel[]=['rising','high','severe'];

const L=(text:string):Line=>({text,proposal:true});
const w=(id:string,headline:string,body:string,aiBadge=false):WearinessNotice=>({id,headline,body,aiBadge,proposal:true});

/** The private strip and notices. `label` is for Kindle and Aurelle; Korund shows `korundLabel`. The weekly and tooltip lines never use the word
 * "weariness", so every nation can show them. */
export const wearinessStrip={
 label:'War weariness',
 korundLabel:'Resolve',
 levelLine:'{band}',
 levelNames:{rising:'Rising',high:'High',severe:'Severe'} as Readonly<Record<WearinessLevel,string>>,
 tooltip:[
  L('Each game week at war adds Unrest. Losses and lost squares speed it up.'),
  L('The longer a war goes on, the more Unrest it adds each game week.'),
 ],
 weekly:[
  L('Another week of war. Unrest rose by {amount}.'),
  L('The war added {amount} of Unrest this week.'),
 ],
 proposal:true,
} as const;

/** Banner wording per nation and level (labels, 40). */
export const wearinessBanners:Readonly<Record<WearinessNation,Readonly<Record<WearinessLevel,string>>>>={
 kindle:{rising:'War weariness is rising',high:'Many want this war to end',severe:'The war is wearing the Republic down'},
 korund:{rising:'Resolve is being tested',high:'Resolve is tested, and it holds',severe:'Resolve is tested, and must hold'},
 aurelle:{rising:'The Crown asks patience',high:'The realm bears a heavy burden',severe:'The burden of war weighs on the realm'},
};

/** Home-front news, one notice per nation and level, in each press voice. Korund (state's own war) and the Crown's decree are badged. */
export const wearinessNews:readonly WearinessNationNews[]=[
 {nationId:'kindle',byline:{name:'Republic Wire Service',proposal:true},proposal:true,notices:{
  rising:w('kindle-rising','War weariness is rising','Republic Wire Service: war weariness is rising. Citizens ask how long the war must last.'),
  high:w('kindle-high','Calls to end the war grow','Republic Wire Service: polls show doubt about the war. Officials must answer the calls to end it.'),
  severe:w('kindle-severe','The war weighs on the Republic','Republic Wire Service: weariness is severe. Pressure on officials to end the war is hard to ignore.')}},
 {nationId:'korund',byline:{name:'Korund State Media',proposal:false},proposal:true,notices:{
  rising:w('korund-rising','Resolve is being tested','Korund State Media reports: the war tests the resolve of Korund. Brigades hold the plan.',true),
  high:w('korund-high','Resolve holds','Korund State Media reports: resolve holds as the war goes on. Order is kept.',true),
  severe:w('korund-severe','Resolve is tested to the full','Korund State Media reports: the war asks much of resolve. The plan advances, and Korund endures.',true)}},
 {nationId:'aurelle',byline:{name:'Court Gazette',proposal:false},proposal:true,notices:{
  rising:w('aurelle-rising','The Crown asks patience','The Court Gazette reports that the Crown asks the realm for patience in this war.'),
  high:w('aurelle-high','The realm bears the burden','The Court Gazette reports that the realm bears a heavy burden of war. The Crown is mindful of it.'),
  severe:w('aurelle-severe','The Crown speaks of the burden','Be it known: the Crown knows the burden of war upon the realm, and asks its patience. Every thread in its place.',true)}},
];
export function wearinessNewsFor(nationId:WearinessNation){return wearinessNews.find(x=>x.nationId===nationId);}

/** War-ended relief (system lines): says only that the weekly addition stops, as the docs give no relief amount. */
export const wearinessRelief=[
 L('The war is over. War weariness no longer grows.'),
 L('The war has ended, so no more Unrest is added by war each week.'),
] as const;
