/** Peace treaty and ceasefire result copy for Kindle, Korund and Aurelle (issue #360, companion to #309/#312/#313). Content only:
 * #309 and #308 own wars, treaties and the lock clock, and no UI imports this. lib/war-copy.ts already has the war-ended status
 * line ("ended by ceasefire or peace treaty") and the blocked-declaration line for a recent peace treaty; this sibling module adds
 * only what #360 found missing: the peace offer prompt, accept and decline labels, the peace-lock banner, and one peace-signed and
 * one ceasefire-broken press line per nation. Canon: harimu-docs trade-diplomacy-sanctions §13.2 (ceasefire or peace ends a war and may
 * include reparations, cessions and demilitarized zones; peace locks war declarations for 10 real days), §13.5 (the 10-day peace lock
 * is a docs [ASSUMPTION]), §13.1 (every negotiator and ratifier is an AI), territory-cities-warfare §15.3, MVP Scope Diplomacy and War
 * rows, and the three press voices: Kindle (#237, Republic Wire Service), Korund State Media (#238/#244) and the Aurelle Court Gazette
 * (#239). Bylines match lib/press-templates.ts, as in lib/war-copy.ts and lib/diplomacy-copy.ts.
 *
 * Rules: no figures. The lock length is the docs' own number, but it is never written in prose: the end time comes only through
 * {readyAt}. No reparation or cession sizes, no named terms. Press lines are written from the nation's own war: {other} is the nation it
 * made peace or a ceasefire with. Placeholders ({other}, {readyAt}) are pre-formatted strings capped by the shared name cap, which this
 * module re-exports (COUP_NAME_MAX from lib/palace-coup-copy.ts). Press headlines are fixed text. Crown "Be it known" lines are
 * AI-badged, and so, since #381 (docs ui-ux 23.2), are Korund State Media lines, which speak for the AI Chairman and Presidium. Limits: labels and headlines 40, lines 80 (ARC's number for this batch), tested with every placeholder filled to 24
 * characters. All wording is new: `proposal: true`. */

export { COUP_NAME_MAX as PEACE_NAME_MAX } from './palace-coup-copy';

export const PEACE_PLACEHOLDERS=['{other}','{readyAt}'] as const;
export const PEACE_LABEL_MAX=40;
export const PEACE_LINE_MAX=80;

export type Line={text:string;proposal:true};
export type PeaceNation='kindle'|'korund'|'aurelle';
export type PeaceEvent='signed'|'ceasefireBroken';
export type PressLine={text:string;aiBadge:boolean;proposal:true};
export type PeacePress={nationId:PeaceNation;byline:{name:string;proposal:boolean};headline:Readonly<Record<PeaceEvent,string>>;report:Readonly<Record<PeaceEvent,PressLine>>;crown?:{signed:PressLine};proposal:true};

export const PEACE_NATIONS:readonly PeaceNation[]=['kindle','korund','aurelle'];
export const PEACE_EVENTS:readonly PeaceEvent[]=['signed','ceasefireBroken'];

const L=(text:string):Line=>({text,proposal:true});
const P=(text:string,aiBadge=false):PressLine=>({text,aiBadge,proposal:true});

/** Private UI: offer, answer and result lines, nation-neutral. The Offer, Accept and Decline labels and prompts are for the AI negotiator's actions, not a citizen control (MVP negotiators are all AI, §13.1). */
export const peaceOffer={
 offerButton:'Offer peace',
 acceptButton:'Accept',
 declineButton:'Decline',
 offerPrompt:L('Offer peace to {other}? A peace treaty ends the war.'),
 incomingPrompt:L('{other} offers peace. Accepting ends the war.'),
 accepted:L('Peace with {other} is signed. The war is over.'),
 declined:L('Peace declined. The war with {other} goes on.'),
 proposal:true,
} as const;

/** Peace-lock banner after a treaty lands. The end time is a pre-formatted {readyAt}; the lock length is never written. */
export const peaceLockBanner={
 header:'Peace lock',
 line:L('Peace lock: no war declarations until {readyAt}.'),
 explainer:L('A peace treaty locks war declarations until {readyAt}.'),
 proposal:true,
} as const;

/** Press: a fixed headline and one report per event in each nation's voice, from the nation's own war. Aurelle also has a Crown line
 * for the signing, AI-badged ("Be it known"). */
export const peacePress:readonly PeacePress[]=[
 {nationId:'kindle',byline:{name:'Republic Wire Service',proposal:true},proposal:true,
  headline:{signed:'Peace is signed',ceasefireBroken:'A ceasefire is broken'},
  report:{signed:P('Peace signed with {other}. Ask officials what the terms are.'),ceasefireBroken:P('The ceasefire with {other} is broken. Officials must explain.')}},
 {nationId:'korund',byline:{name:'Korund State Media',proposal:false},proposal:true,
  headline:{signed:'State Media: peace signed',ceasefireBroken:'State Media: ceasefire broken'},
  report:{signed:P('State Media: peace with {other}. The plan goes on.',true),ceasefireBroken:P('State Media: the ceasefire with {other} is broken.',true)}},
 {nationId:'aurelle',byline:{name:'Court Gazette',proposal:false},proposal:true,
  headline:{signed:'The Court notes a peace',ceasefireBroken:'The Court notes a broken ceasefire'},
  report:{signed:P('Court Gazette: peace is signed with {other}.'),ceasefireBroken:P('Court Gazette: the ceasefire with {other} is broken.')},
  crown:{signed:P('Be it known: the Crown signs peace with {other}.',true)}},
];
export function peacePressFor(nationId:PeaceNation){return peacePress.find(x=>x.nationId===nationId);}
