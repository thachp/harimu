/** Korund gray-market form and board chrome: the labels, help line and refusals the gray market panel keeps as literals because the earlier gray
 * market copy does not have them (issue #512, companion to #43). Content only; nothing imports this until those literals are swapped. The entry
 * label, risk warning, rumored-rate lines, offer lines and street whispers stay in the separate gray market copy module and are not repeated here.
 * Canon: harimu-docs economy-currency §12.9 (private cash-bundle trades at a negotiated street rate), citizens-daily-loops (Korund: optional,
 * risky gray market) and ARC's ruling on #43 (option A): FC is smuggled foreign cash, off the books, never convertible, and not a Korund currency.
 *
 * Key names match the panel's text table exactly (cashLabel, cashHelp, amountLabel, rateLabel, postButton, acceptButton, noRumor, yourOffer,
 * boardTitle) and the refusal reasons match its server reasons exactly (out_of_range, offer_open, insufficient_ln, insufficient_cash,
 * seller_short, taken, expired, no_offer, own_offer, request_reused, korund_only), so the swap is a rename of imports.
 *
 * Voice: system chrome, plain; no byline, no AI badge, no State Media. Rules: no figure is written into a line: the offer limits are four
 * pre-formatted runtime values ({minAmount}, {maxAmount}, {minRate}, {maxRate}, each with its unit, e.g. an amount of Labor Notes or a rate in
 * FC per LN) and an offer's own amount and asking rate are {amount} and {askRate}. FC is never called a currency of Korund and no line implies it
 * can be exchanged or converted officially. Suspicion, seizure, Tessera and official settlement are not mentioned. Limits: labels 40, lines 80,
 * bodies 140, tested with every placeholder filled to 20 characters. All wording is new: `proposal: true`. */

export { COUP_NAME_MAX as GRAY_CHROME_NAME_MAX } from './palace-coup-copy';

export const GRAY_CHROME_PLACEHOLDERS=['{minAmount}','{maxAmount}','{minRate}','{maxRate}','{amount}','{askRate}'] as const;
/** Worst-case length of a pre-formatted amount or rate with its unit. */
export const GRAY_CHROME_VALUE_MAX=20;
export const GRAY_CHROME_LABEL_MAX=40;
export const GRAY_CHROME_LINE_MAX=80;
export const GRAY_CHROME_BODY_MAX=140;

export type Line={text:string;proposal:true};
const L=(text:string):Line=>({text,proposal:true});

/** Form, card and board chrome, under the panel's own key names. Strings with a longer help or accessible text carry a Line. */
export const grayChrome={
 cashLabel:'Smuggled foreign cash',
 cashHelp:L('FC is smuggled foreign cash, kept off the books. It is not a Korund currency and cannot be converted. It only changes hands in a trade here.'),
 amountLabel:'Labor Notes to sell',
 rateLabel:'Asking rate (FC per LN)',
 postButton:'Post offer',
 acceptButton:'Accept offer',
 acceptAccessibleName:L('Accept this offer: {amount} at asking rate {askRate}'),
 noRumor:L('No rumor yet: nobody has traded.'),
 yourOffer:'Your offer',
 boardTitle:'Offers on the street',
 proposal:true,
} as const;

export type GrayRefusalReason='out_of_range'|'offer_open'|'insufficient_ln'|'insufficient_cash'|'seller_short'|'taken'|'expired'|'no_offer'|'own_offer'|'request_reused'|'korund_only';
export const GRAY_REFUSAL_REASONS:readonly GrayRefusalReason[]=['out_of_range','offer_open','insufficient_ln','insufficient_cash','seller_short','taken','expired','no_offer','own_offer','request_reused','korund_only'];

/** Refusals by server reason. Plain system lines; none blames the player or mentions Suspicion or seizure. */
export const grayRefusalCopy:Record<GrayRefusalReason,Line>={
 out_of_range:L('Offer between {minAmount} and {maxAmount}, at a rate between {minRate} and {maxRate}.'),
 offer_open:L('You already have an open offer. It will expire on its own.'),
 insufficient_ln:L('You do not have that many Labor Notes.'),
 insufficient_cash:L('You do not have enough FC for that offer.'),
 seller_short:L('The trade could not settle, and nothing changed hands.'),
 taken:L('Another player accepted that offer first.'),
 expired:L('That offer has expired.'),
 no_offer:L('That offer is no longer on the board.'),
 own_offer:L('You cannot accept your own offer.'),
 request_reused:L('That request was already sent. Refresh and try again.'),
 korund_only:L('The gray market is open to Korund citizens only.'),
};
