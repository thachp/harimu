/** #1016 Kindle High Court certification (docs elections §9.1 Certification: the count is automatic and the AI High Court
 *  certifies within 24 hours). Derived from the closed ballot the election read already returns. No table, no migration, no write.
 *  #1025: once certified, the same object carries a display-only transition week for 7 days (docs §9.1 Transition, Days 120–127).
 *  Fraud-flag holds, and blocking treasury spends or war declarations, stay out of scope.
 *  The 24 hours and the 7 days are the docs figures. [ASSUMPTION] the two certification sentences and the no-winner sentence.
 *  [ASSUMPTION] the transition clock shown to citizens is second-precision UTC, and the week still shows at the exact endsAt instant. */
import { flagOn } from './flag-pack.mjs';
import { transitionBanner } from './kindle-certification-copy.ts';

export const kindleCertificationSeconds = 24 * 3600;
export const kindleTransitionSeconds = 7 * 24 * 3600;
export const kindleCertificationEnabled = (env: unknown) => flagOn(env, 'HARIMU_KINDLE_CERTIFICATION_ENABLED');

export type KindleTransition = { endsAt: number; line: string };
export type KindleCertification = { state: 'awaiting' | 'certified'; line: string; certifiesAt: number; transition?: KindleTransition };

const awaitingLine = 'The count is finished. The AI High Court certifies the result within 24 hours.';
const certifiedLine = (winner: string | null) => winner
  ? `The AI High Court has certified the result. ${winner} is President-elect.`
  : 'The AI High Court has certified the result. No winner is named.';

/** One citizen line from the #609 transition banner. endsAt fills {inaugurationAt}. */
export function kindleTransitionLine(endsAt: number): string {
  const when = new Date(endsAt * 1000).toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
  return `${transitionBanner.label}. ${transitionBanner.inauguration.replace('{inaugurationAt}', when)}. ${transitionBanner.line.text}`;
}

/** A confirmed closed count only. Before 24 hours the court is still certifying; at that mark the result is certified.
 *  The transition week is present from certification through endsAt (certification + 7 days) inclusive. Same input, same output. */
export function kindleCertification(input: { status: string; closesAt: number | null; now: number; confirmed: boolean; winnerName: string | null }): KindleCertification | null {
  if (input.status !== 'closed' || !input.confirmed || input.closesAt === null || !Number.isSafeInteger(input.closesAt) || !Number.isSafeInteger(input.now)) return null;
  const certifiesAt = input.closesAt + kindleCertificationSeconds;
  if (input.now < certifiesAt) return { state: 'awaiting', certifiesAt, line: awaitingLine };
  const winner = input.winnerName && input.winnerName.length <= 80 && !/[\r\n<>]/.test(input.winnerName) ? input.winnerName : null;
  const certified: KindleCertification = { state: 'certified', certifiesAt, line: certifiedLine(winner) };
  const endsAt = certifiesAt + kindleTransitionSeconds;
  if (input.now <= endsAt) certified.transition = { endsAt, line: kindleTransitionLine(endsAt) };
  return certified;
}
