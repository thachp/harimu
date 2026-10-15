/** Clearing House kiosk copy wiring (#210 follow-up; strings from Content's #325, lib/clearing-house-copy.ts).
 * Every placeholder value is a pre-formatted string that already carries its unit ("5.00 TSR", "20.00 SPK"), so the copy adds no unit.
 * Runtime values stay within CLEARING_HOUSE_NAME_MAX (24) characters. */
import { kioskPanel, purchaseCopy, refusals, type RefusalKey } from './clearing-house-copy';

export type CopyValues = Partial<Record<'rate' | 'amount' | 'cost' | 'min' | 'max', string>>;
export const tsr = (minor: number) => `${(Math.max(0, minor) / 100).toFixed(2)} TSR`;
export const spk = (minor: number) => `${(Math.max(0, minor) / 100).toFixed(2)} SPK`;
export const fillCopy = (text: string, values: CopyValues) => text.replace(/\{(rate|amount|cost|min|max)\}/g, (match, key: keyof CopyValues) => values[key] ?? match);

export const kioskHeader = kioskPanel.header;
export const kioskExplainer = `${kioskPanel.explainer.text} ${kioskPanel.neutral.text}`;
export const kioskComingSoon = kioskPanel.comingSoon.text;
export const kioskRateLine = (rate: number) => fillCopy(kioskPanel.rateLine.text, { rate: `1 SPK = ${rate.toFixed(2)} TSR` });
export const kioskBuyLabel = (tesseraMinor: number) => fillCopy(kioskPanel.buyButtons[0], { amount: tsr(tesseraMinor) });
export const kioskClosed = refusals.closed[0].text;
export const kioskReceipt = (tesseraMinor: number, sparkMinor: number) => fillCopy(purchaseCopy.receipt[0].text, { amount: tsr(tesseraMinor), cost: spk(sparkMinor) });
/** Wallet history row: "Clearing House kiosk · bought {amount} · paid {cost}". */
export const kioskHistoryRow = (tesseraMinor: number, sparkMinor: number) => fillCopy(purchaseCopy.history[0].text, { amount: tsr(tesseraMinor), cost: spk(Math.abs(sparkMinor)) });

/** Server refusal reasons (lib/tessera-exchange.ts, POST /api/world/registry) to the copy's refusal keys. */
export const refusalForReason: Readonly<Record<string, RefusalKey>> = {
  disabled: 'closed', non_convertible: 'korund', no_kiosk: 'other-nation', insufficient_spark: 'insufficient-spark', out_of_range: 'out-of-range',
};
/** [not in #325] A request the kiosk could not read (a missing or malformed request id): not an amount problem, so it gets its own plain line. */
export const kioskBadRequest = 'The kiosk could not read that request. Try again.';
/** Refusal line for a server reason, or null when the reason has no copy (the caller keeps the server's message). */
export function kioskRefusal(reason: unknown, values: CopyValues): string | null {
  if (reason === 'bad_request') return kioskBadRequest;
  const key = typeof reason === 'string' ? refusalForReason[reason] : undefined;
  return key ? fillCopy(refusals[key][0].text, values) : null;
}
