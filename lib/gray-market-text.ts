// Korund gray market copy wiring (#43). Strings are Content's #314 (lib/gray-market-copy.ts), in their exact wording; this module is the
// only importer of that file. It fills the pre-formatted placeholders: {rate} is ONE approximate rumored figure, {askRate} and {amount}
// belong to an offer and are kept apart from it. Only the PoC warning lines are used (riskWarning); the deferred Suspicion / seizure lines
// are not shown. Lines #314 does not have stay here, marked [not in #314].
import { grayMarketEntry, riskWarning, rumoredRate, offerLines, GRAY_MARKET_NAME_MAX } from './gray-market-copy';

/** FC is smuggled foreign cash: an off-book, never-convertible unit (ARC on #43, option A). Amounts are minor units (100 = 1.00). */
export const ln = (minor: number): string => `${(minor / 100).toFixed(2)} LN`;
export const fc = (minor: number): string => `${(minor / 100).toFixed(2)} FC`;
/** An asking or rumored rate: hundredths of an FC per LN, shown as FC per LN, e.g. "1.10 FC per LN". */
export const rate = (hundredths: number): string => `${(hundredths / 100).toFixed(2)} FC per LN`;
export const fillGray = (text: string, values: Record<string, string>): string => Object.entries(values).reduce((out, [key, value]) => out.replaceAll(`{${key}}`, value), text);

export const grayText = {
  label: grayMarketEntry.label,
  subtitle: grayMarketEntry.subtitle.text,
  warningTitle: riskWarning.title,
  warning: riskWarning.lines.map(line => line.text),
  rumorLabel: rumoredRate.label,
  maxName: GRAY_MARKET_NAME_MAX,
  // [not in #314] labels and one-line help for the form, the cards and the balance
  cashLabel: 'Smuggled foreign cash',
  cashHelp: 'FC is smuggled foreign cash. It is not a Korund currency, cannot be converted, and only changes hands in a trade here.',
  amountLabel: 'Labor Notes to sell',
  rateLabel: 'Asking rate (FC per LN)',
  postButton: 'Post offer',
  acceptButton: 'Accept offer',
  noRumor: 'No rumor yet: nobody has traded.',
  yourOffer: 'Your offer',
  boardTitle: 'Offers on the street',
} as const;

/** The rumor line for a figure (first #314 variant): the rate arrives as one pre-formatted approximate value. */
export const rumorLine = (hundredths: number): string => fillGray(rumoredRate.lines[0].text, { rate: rate(hundredths) });
/** #758 [not in #314] wallet line under the LN balance; always labeled a rumor, never official. */
export const walletRumorTag = 'rumor, not official';
export const walletStreetRateLine = (hundredths: number | null): string => hundredths === null ? `Rumored street rate: no recent trades (${walletRumorTag})` : `Rumored street rate: about ${rate(hundredths)} (${walletRumorTag})`;
/** #1000 Bureau display quote (docs §12.8). TSR minor units per 100 LN minor units: 1.00 LN = 0.20 TSR.
 *  [ASSUMPTION] the docs name the Bureau rate and give no figure. Same minor-unit round-down as lib/wallet.ts quoteTessera.
 *  Not the rumored street rate above (that line is FC per LN and stays a rumor). Display only. */
export const laborNoteBureauHundredths = 20;
export function quoteLaborNoteTessera(laborMinor: number, hundredths = laborNoteBureauHundredths): number {
  if (!Number.isSafeInteger(laborMinor) || laborMinor <= 0 || !Number.isSafeInteger(hundredths) || hundredths <= 0) return 0;
  return Math.floor(laborMinor * hundredths / 100);
}
export const bureauTsrLine = (laborMinor: number): string => `≈ ${(quoteLaborNoteTessera(laborMinor) / 100).toFixed(2)} TSR at the Bureau rate · not convertible`;
export const noOffersLine = offerLines.none[0].text;
export const postedLine = (amountMinor: number, askRate: number): string => fillGray(offerLines.posted[0].text, { amount: ln(amountMinor), askRate: rate(askRate) });
export const acceptedLine = (amountMinor: number, askRate: number): string => fillGray(offerLines.accepted[0].text, { amount: ln(amountMinor), askRate: rate(askRate) });
export const expiredLine = offerLines.expired[0].text;

// [not in #314] refusals by server reason
export const grayRefusal: Record<string, string> = {
  out_of_range: 'Offer 0.01 to 50.00 LN at a rate of 0.01 to 100.00 FC per LN.',
  offer_open: 'You already have an open offer. It expires on its own.',
  insufficient_ln: 'You do not hold that many Labor Notes.',
  insufficient_cash: 'You do not hold enough FC for that offer.',
  seller_short: 'That trade could not settle. Nothing changed hands.',
  taken: 'Another player took that offer first.',
  expired: 'That offer expired.',
  no_offer: 'That offer is gone.',
  own_offer: 'You cannot accept your own offer.',
  request_reused: 'That request was already used. Refresh and try again.',
  korund_only: 'Only Korund citizens can use the gray market.',
};
