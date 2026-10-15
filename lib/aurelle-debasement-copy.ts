/** Aurelle Crown debasement copy (issue #408, companion to #362). Content only: #362 owns mint parity, Currency Confidence and the
 * decree path, and no UI imports this. Canon: harimu-docs economy-currency §12.3 (Aurelle's Crown is gold-backed and convertible at a
 * declared mint parity; debasement gives the crown an instant windfall but drops Currency Confidence, and full-weight old coins are
 * then hoarded and trade at a premium), §12.4 (the Monarch may re-coin within a small band or debase by decree; those limits live in
 * #362, not here), §12.9 (debasement is a source of black-market premium for full-weight coins), ui-ux (Aurelle's coins show the
 * current mint parity), culture-bible Aurelle (full-weight old Crowns are kept as heirlooms) and ai-leadership (the AI Monarch's
 * decrees). Bylines come from lib/press-templates.ts (Court Gazette, Republic Wire Service, Korund State Media).
 *
 * Voice: the Court Gazette is ornate and deferential. Decrees ("Be it known") speak for the AI Monarch, so they are AI-badged (#381,
 * ui-ux §23.2); a Gazette report, the commoner rumors and the Kindle and Korund reports about the Monarch's act are not. The Clearing
 * House kiosk speaks as a plain system notice (the kiosk copy module), with no official behind it. Rumors are marked as rumor and
 * never state an official rate.
 *
 * Rules: no numbers appear in the copy: the 5% re-coinage band, the 15% a game year cap and any Confidence threshold stay in #362,
 * and the Confidence bands here are labels only. Parity, rate and the band name come only through placeholders: {parity} and {rate}
 * are pre-formatted strings that already carry their unit, {band} is one of the band labels. Limits: labels 40, lines 80, tested with
 * every placeholder filled to the shared 24-character name cap, which this module re-exports (COUP_NAME_MAX from
 * lib/palace-coup-copy.ts). All wording is new: `proposal: true`. */

export { COUP_NAME_MAX as DEBASEMENT_NAME_MAX } from './palace-coup-copy';

export const DEBASEMENT_PLACEHOLDERS=['{parity}','{rate}','{band}'] as const;
export const DEBASEMENT_LABEL_MAX=40;
export const DEBASEMENT_LINE_MAX=80;

export type Line={text:string;proposal:true};
export type DecreeKey='debasement'|'recoinage';
export type Decree={key:DecreeKey;headline:string;body:string;aiBadge:boolean;proposal:true};
export type ConfidenceBand='high'|'middle'|'low';
export type Rumor={text:string;rumor:true;aiBadge:false;proposal:true};
export type PressReport={outlet:'kindle'|'korund';text:string;aiBadge:false;proposal:true};
const L=(text:string):Line=>({text,proposal:true});

export const DECREE_KEYS:readonly DecreeKey[]=['debasement','recoinage'];
export const CONFIDENCE_BANDS:readonly ConfidenceBand[]=['high','middle','low'];

/** Bylines (lib/press-templates.ts): Court Gazette is canon; Republic Wire Service is a proposal; Korund State Media is canon. */
export const DEBASEMENT_BYLINES={
 gazette:{name:'Court Gazette',proposal:false},
 kindle:{name:'Republic Wire Service',proposal:true},
 korund:{name:'Korund State Media',proposal:false},
} as const;

/** Read-only coin strip: labels only. The numbers and the band the Crown is in come from #362. */
export const crownStrip={
 header:'Crown coin',
 mintParity:'Mint parity: {parity}',
 confidence:'Currency Confidence',
 confidenceLine:'Confidence: {band}',
 bandLabels:{high:'Trusted',middle:'Wavering',low:'Shaken'} as Readonly<Record<ConfidenceBand,string>>,
 readOnly:L('Set by royal decree. You cannot change it.'),
 proposal:true,
} as const;

/** Court Gazette decrees: the Crown speaks, so both are AI-badged (#381). */
const d=(key:DecreeKey,headline:string,body:string):Decree=>({key,headline,body,aiBadge:true,proposal:true});
export const decrees:Readonly<Record<DecreeKey,Decree>>={
 debasement:d('debasement','The coinage is reissued','Be it known: by royal decree, the Crown is reissued at {parity}.'),
 recoinage:d('recoinage','The coinage is recut','Be it known: the Royal Mint recoins the Crown at {parity}.'),
};
/** Gazette reports about the coinage that are not decrees (no badge). */
export const gazetteReports=[
 L('The Court Gazette records a new mint parity: {parity}.'),
 L('The Court Gazette notes murmurs in the markets over the Crown.'),
] as const;

/** Commoner-voice rumors about full-weight coins (§12.3). Marked as rumor; none states a rate. */
const r=(text:string):Rumor=>({text,rumor:true,aiBadge:false,proposal:true});
export const fullWeightRumors:readonly Rumor[]=[
 r('Rumor, not an official rate: old full-weight Crowns sell at a premium.'),
 r('Heirloom Crowns are being kept back, friend. Or so the rumor goes.'),
 r('They say a full-weight Crown buys more than a new Crown. Only a rumor.'),
];

/** One Kindle and one Korund report on an Aurelle debasement. Reports about the Monarch's act, not the Monarch speaking: no badge. */
const p=(outlet:'kindle'|'korund',text:string):PressReport=>({outlet,text,aiBadge:false,proposal:true});
export const pressReports:readonly PressReport[]=[
 p('kindle','Republic Wire Service: Aurelle reissues the Crown. Traders ask what it is worth.'),
 p('korund','Korund State Media: The Aurelle Crown is debased. The Monarch spends trust.'),
];
export const pressReportFor=(outlet:'kindle'|'korund')=>pressReports.find(x=>x.outlet===outlet);

/** Clearing House kiosk notice when the Crown rate moves after a debasement: plain system voice, no official. {rate} is pre-formatted. */
export const kioskRateMoved=[
 L('The Crown rate moved after a coinage decree. Rate: {rate}'),
 L('Crown rate updated after a decree. Official rate: {rate}'),
] as const;

export const decreeFor=(key:DecreeKey)=>decrees[key];
