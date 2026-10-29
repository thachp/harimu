/** #1016 Kindle High Court certification (docs elections §9.1 Certification: the count is automatic and the AI High Court
 *  certifies within 24 hours). Derived from the closed ballot the election read already returns. No table, no migration, no write.
 *  Fraud-flag review and the transition-week treasury and war limits are out of scope.
 *  The 24 hours are the docs figure. [ASSUMPTION] the two citizen-facing sentences, and the no-winner sentence: the docs do not give the wording. */
import { flagOn } from './flag-pack.mjs';

export const kindleCertificationSeconds = 24 * 3600;
export const kindleCertificationEnabled = (env: unknown) => flagOn(env, 'HARIMU_KINDLE_CERTIFICATION_ENABLED');

export type KindleCertification = { state: 'awaiting' | 'certified'; line: string; certifiesAt: number };

const awaitingLine = 'The count is finished. The AI High Court certifies the result within 24 hours.';
const certifiedLine = (winner: string | null) => winner
  ? `The AI High Court has certified the result. ${winner} is President-elect.`
  : 'The AI High Court has certified the result. No winner is named.';

/** A confirmed closed count only. Before 24 hours the court is still certifying; at that mark the result is certified. Same input, same output. */
export function kindleCertification(input: { status: string; closesAt: number | null; now: number; confirmed: boolean; winnerName: string | null }): KindleCertification | null {
  if (input.status !== 'closed' || !input.confirmed || input.closesAt === null || !Number.isSafeInteger(input.closesAt) || !Number.isSafeInteger(input.now)) return null;
  const certifiesAt = input.closesAt + kindleCertificationSeconds;
  if (input.now < certifiesAt) return { state: 'awaiting', certifiesAt, line: awaitingLine };
  const winner = input.winnerName && input.winnerName.length <= 80 && !/[\r\n<>]/.test(input.winnerName) ? input.winnerName : null;
  return { state: 'certified', certifiesAt, line: certifiedLine(winner) };
}
