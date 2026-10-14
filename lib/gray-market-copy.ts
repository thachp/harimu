/** Korund gray-market screen copy: entry label, risk warning, rumored street rate, offer lines and street whispers
 * (issue #301, companion to SDE #43). Content only: #43 owns trades, Suspicion, seizures and the rumored-rate math, and
 * no UI imports this. Canon: harimu-docs economy-currency §12.9 (private cash-bundle trades at a negotiated street rate;
 * the system publishes a deliberately noisy rumored rate; each illicit trade adds Suspicion where it is a crime;
 * cash bundles can be seized at a checkpoint; punishments are capped), the wallet Display row (the rumored rate is shown
 * only where the citizen has heard of it), citizens-daily-loops (Korund: "(optional, risky) gray market") and §12 (Korund:
 * illegal gray market, fixed prices, rations).
 *
 * Voice: the State Media pack (#238) leaves the gray market out by rule and State Media would never speak of it, so this
 * copy uses a plain, private street voice; the whispers are low and unattributed. No State Media byline.
 *
 * Rules: no numbers (caps, durations and Suspicion amounts stay in #43). The rumored rate appears only through {rate},
 * and every line that shows it frames it as a rumor and approximate, never official or exact. An offer shows its own
 * {askRate} (the asking rate) and {amount}, kept apart from the rumored rate. Suspicion, penalties and seizure are out of
 * #43's PoC, so they live in GRAY_MARKET_WARNING_DEFERRED, not in the screen's PoC lines. No real-world currency, drug
 * or crime slang; no informer, player or person is named; no raids or smuggling careers (out of scope). Faith-neutral.
 * The runtime values are capped by the shared name cap, which this module re-exports (COUP_NAME_MAX from
 * lib/palace-coup-copy.ts). All wording is new: `proposal: true`. */

export { COUP_NAME_MAX as GRAY_MARKET_NAME_MAX } from './palace-coup-copy';

/** {rate}: the rumored street rate (one rounded figure). {askRate}: the rate an offer's poster asked for. {amount}: the offer's amount.
 * {askRate} is never the rumored rate and is always called the asking rate. */
export const GRAY_MARKET_PLACEHOLDERS=['{rate}','{askRate}','{amount}'] as const;
export const GRAY_MARKET_LABEL_MAX=40;
export const GRAY_MARKET_BODY_MAX=140;

export type Line={text:string;proposal:true};
const L=(text:string):Line=>({text,proposal:true});

export const grayMarketEntry={
 label:'Gray market',
 subtitle:L('Optional, illegal and risky.'),
 proposal:true,
} as const;

/** The PoC warning (#43): illegal and optional only. Suspicion, penalties and seizure are not in #43's PoC. */
export const riskWarning={
 title:'Before you trade',
 lines:[
  L('The gray market is illegal in Korund.'),
  L('It is optional. Trade only if you accept the risk.'),
 ],
 proposal:true,
} as const;

/** Deferred to the penalties follow-up (ARC #314): Suspicion, capped penalties and checkpoint seizure are out of #43's PoC,
 * so none of this may be shown until those mechanics exist. */
export const GRAY_MARKET_WARNING_DEFERRED={
 lines:[
  L('Every trade adds Suspicion.'),
  L('Penalties are capped, but cash bundles can be seized at a checkpoint.'),
 ],
 offerPosted:[
  L('Your offer is posted. If another player accepts it, the trade adds Suspicion.'),
  L('Offer posted. Another player may accept it, and a trade adds Suspicion.'),
 ],
 offerAccepted:[
  L('Your offer was accepted. The cash bundles have changed hands, and Suspicion has risen.'),
  L('The deal is made. The trade is done, and it adds to your Suspicion.'),
 ],
 proposal:true,
} as const;

/** Every line shows the rumored rate only as {rate}, and only as a rumor. */
export const rumoredRate={
 label:'Rumored street rate',
 lines:[
  L('You have heard a rumor: the street rate is about {rate}. It is not exact.'),
  L('Word on the street is a rate near {rate}. It is only a rumor and may be wrong.'),
  L('The rumored rate is roughly {rate}. Street talk is rarely exact.'),
 ],
 proposal:true,
} as const;

export const offerLines={
 posted:[
  L('Your offer is posted: {amount} at an asking rate of {askRate}. Another player may accept it.'),
  L('Offer posted: {amount}, asking rate {askRate}. Another player may accept it.'),
 ],
 accepted:[
  L('Your offer was accepted: {amount} at your asking rate of {askRate}. The cash bundles have changed hands.'),
  L('The deal is made: {amount} at the asking rate of {askRate}. The trade is done.'),
 ],
 withdrawn:[
  L('You withdrew your offer. Nothing changed hands.'),
  L('Offer withdrawn. No trade was made.'),
 ],
 expired:[
  L('Your offer expired. Nothing changed hands.'),
  L('The offer ran out of time. No trade was made.'),
 ],
 none:[
  L('No offers right now. Check back later, or post your own.'),
  L('Nobody is offering at the moment. The street is quiet.'),
  L('The board is empty. Offers come and go.'),
 ],
 proposal:true,
} as const;

/** Private street voice; hints the rate is moving without stating a number. */
export const streetWhispers:readonly Line[]=[
 L('Word is the notes are worth a little more tonight.'),
 L('Someone says the rate slipped again. Someone else says it did not.'),
 L('Keep your voice low. They say the rate is on the move.'),
 L('Folk talk of a rate that will not sit still.'),
];
