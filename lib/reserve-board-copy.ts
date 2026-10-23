/** Kindle Reserve Board line, issuance news and Price Index explainer copy (issue #439, companion to #431). Content only: #431 owns the money
 * supply, the monthly issuance, the Charter Limit and the Price Index, and no UI imports this. Canon: harimu-docs economy-currency §12.4
 * (Kindle's independent AI Reserve Board issues Spark up to its normal cap; the Charter Limit is a hard ceiling no route can pass; the
 * national Price Index drifts toward money supply over real output with a lag of a few game weeks) and §12.6 (Kindle publishes its money
 * supply and Price Index). #431 is not on dev yet, so the slots are the three figures its issue names, supplied by the code as
 * pre-formatted strings.
 *
 * Voice: Kindle's press is plain and argumentative (Kindle Press, byline checked against lib/press-templates.ts). Each issuance
 * outcome (none, small, near the cap, rejected by the Charter Limit) has a `report` in that voice and a `statement` in the Reserve Board's
 * own voice. #381 / ui-ux §23.2: the Board is an AI body, so its own statements are AI-badged; the newspaper reports about it are not.
 * Labels, the caption and the explainer are system lines with no byline and no badge.
 *
 * Rules: no figures are hard-coded. Money supply, last issuance and Price Index come only through {supply}, {issued} and {index}; the cap
 * and the Charter Limit are named in words ("the cap", "the Charter Limit") and never as a percentage. The explainer says what the Price
 * Index is and that it follows money supply over a few game weeks, and does not promise that wages or prices react yet (#431 leaves that
 * to a follow-up). Limits: labels 40, lines 80, bodies and the explainer 140, tested with every slot filled to the shared 24-character name
 * cap, which this module re-exports (COUP_NAME_MAX from lib/palace-coup-copy.ts). All wording is new: `proposal: true`. */

export { COUP_NAME_MAX as RESERVE_NAME_MAX } from './palace-coup-copy';

export const RESERVE_PLACEHOLDERS=['{supply}','{issued}','{index}'] as const;
export const RESERVE_LABEL_MAX=40;
export const RESERVE_LINE_MAX=80;
export const RESERVE_BODY_MAX=140;

export type Line={text:string;proposal:true};
export type IssuanceSize='none'|'small'|'near-cap'|'rejected';
export type IssuanceNotice={id:string;headline:string;body:string;aiBadge:boolean;proposal:true};
export type IssuanceNews={size:IssuanceSize;report:IssuanceNotice;statement:IssuanceNotice;proposal:true};

export const ISSUANCE_SIZES:readonly IssuanceSize[]=['none','small','near-cap','rejected'];
/** Canon byline (lib/press-templates.ts kindlePress.byline; a proposal name). */
export const RESERVE_BYLINE={name:'Kindle Press',proposal:false} as const;
export const RESERVE_BOARD_NAME='Reserve Board';

const L=(text:string):Line=>({text,proposal:true});

/** The read-only Reserve Board line for Kindle citizens: header, three labelled rows (slots) and a one-line caption. */
export const reserveBoardLine={
 header:'Reserve Board',
 rows:{moneySupply:'Money supply: {supply}',lastIssuance:'Last issuance: {issued}',priceIndex:'Price Index: {index}'},
 caption:L('Kindle publishes its money figures. Source: the Reserve Board.'),
 proposal:true,
} as const;

const n=(id:string,headline:string,body:string,aiBadge=false):IssuanceNotice=>({id,headline,body,aiBadge,proposal:true});
/** Monthly issuance outcomes. `report`: Kindle Press, not badged. `statement`: the AI Reserve Board speaking, badged. */
export const issuanceNews:readonly IssuanceNews[]=[
 {size:'none',proposal:true,
  report:n('report-none','No new Spark this game month','Kindle Press: the Reserve Board issued no new Spark this game month.'),
  statement:n('statement-none','Reserve Board statement','Reserve Board: no new Spark is issued this game month.',true)},
 {size:'small',proposal:true,
  report:n('report-small','The Board issues new Spark','Kindle Press: the Reserve Board issued {issued} in new Spark this game month.'),
  statement:n('statement-small','Reserve Board statement','Reserve Board: we issued {issued} in new Spark this game month.',true)},
 {size:'near-cap',proposal:true,
  report:n('report-near-cap','Spark issuance near the cap','Kindle Press: the Reserve Board issued {issued}, close to its cap.'),
  statement:n('statement-near-cap','Reserve Board statement','Reserve Board: this game month\'s issuance of {issued} is close to our cap.',true)},
 {size:'rejected',proposal:true,
  report:n('report-rejected','Issuance blocked by the Charter Limit','Kindle Press: an issuance was rejected under the Charter Limit. No new Spark was created.'),
  statement:n('statement-rejected','Reserve Board statement','Reserve Board: an issuance was rejected by the Charter Limit. No Spark was issued.',true)},
];
export function issuanceNewsFor(size:IssuanceSize){return issuanceNews.find(x=>x.size===size);}

/** Plain-word Price Index explainer. It does not promise that wages or prices react (#431 leaves that to a follow-up). */
export const priceIndexExplainer={
 label:'What is the Price Index?',
 lines:[
  L('The Price Index tracks the national price level. It follows money supply over a few game weeks.'),
  L('It is shown for information only.'),
 ],
 proposal:true,
} as const;
