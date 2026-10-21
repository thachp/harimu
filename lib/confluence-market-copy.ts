/** Confluence banded price board copy (Refs #487; Content owns the PoC wiring copy). Content only: the board itself and its numbers belong to
 * the Confluence proof of concept, and nothing imports this module. Canon: harimu-docs the Confluence nation sheet (prices float within
 * state price bands for staples; banded price boards in markets) and the culture bible's posted price (a proposal there). ARC asked for
 * "posted state price" wording: the price a citizen reads is the one the state posts, and it stays inside the band.
 *
 * Voice: quiet, collective, plain system lines; no AI body speaks, so nothing is badged (#381 / ui-ux §23.2). Rules: no figure is written. The
 * price, the band floor and ceiling and the band width come only through pre-formatted placeholders ({price}, {floor}, {ceiling}, each
 * already carrying its currency; {band}, a width already carrying its unit), capped at a local 24 characters, and {staple} and {portion} name the
 * good. Limits: labels 40, lines 100, tested with every placeholder filled to its cap. All wording is new: `proposal: true`. */

export const MARKET_NAME_MAX=24;
export const MARKET_LABEL_MAX=40;
export const MARKET_LINE_MAX=100;
export const MARKET_PLACEHOLDERS=['{staple}','{portion}','{price}','{floor}','{ceiling}','{band}'] as const;

export type Line={text:string;proposal:true};
const L=(text:string):Line=>({text,proposal:true});

export const priceBoard={
 title:'Banded price board',
 stapleLine:'{staple}, per {portion}',
 postedPriceLabel:'Posted state price',
 postedPriceValue:'{price} per {portion}',
 bandLabel:'State price band',
 bandValue:'{floor} to {ceiling} (±{band})',
 explainer:L('The state sets a band for each staple and posts a price inside it.'),
 readOnly:L('This board shows the posted state price. Buying is not open here yet.'),
 empty:L('No posted state price yet.'),
 proposal:true,
} as const;

export const confluenceMarketCopy={board:priceBoard,proposal:true} as const;
