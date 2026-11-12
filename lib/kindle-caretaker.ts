/** #1363 treasury half (docs elections §9.1 Transition, Days 120–127): the outgoing AI President cannot spend treasury.
 *  Same flag (`HARIMU_KINDLE_CERTIFICATION_ENABLED`) and the same `kindleCertification` transition as #1025 / #1365
 *  (present from certification through endsAt, inclusive). War declarations reuse this helper via `kindleDeclarationCaretaker`.
 *  The only current debit of `kindle-treasury` is the Dormant Savings Shield welfare payout (docs §12.8); that is a statutory
 *  credit on a citizen's return, not a presidential spend, and is not gated here. Policy spend stays on `kindle-employer`.
 *  No new flag, no migration. Fraud-flag holds stay out of scope. */
import { env } from 'cloudflare:workers';
import type { GameDatabase } from './database-contract';
import { isMissingRelation, tolerate } from './db-errors';
import { kindleCertification, kindleCertificationEnabled } from './kindle-certification-rules';

const L = (text: string): { text: string; proposal: true } => ({ text, proposal: true });

/** Refusal copy reuses the shipped caretaker sentence (#609 / #1025 / #1365) in the same "was not made" shape as war. */
export const blockedTreasurySpend = {
  caretaker: L('The spend was not made. Until inauguration, the outgoing AI President cannot spend the treasury or declare war.'),
  proposal: true as const,
};

/** True while Kindle's outgoing President is a caretaker. Flag off, no ballot, or no transition: false.
 *  A missing elections table is not a window. A closed ballot is the confirmed count the election read publishes. */
export async function kindleOutgoingPresidentIsCaretaker(db: GameDatabase, now: number): Promise<boolean> {
  if (!kindleCertificationEnabled(env)) return false;
  const row = await db.prepare('SELECT closes_at,closed_at FROM civic_elections ORDER BY opens_at DESC, id DESC LIMIT 1')
    .first<{ closes_at: number; closed_at: number | null }>().catch(tolerate(isMissingRelation, null));
  if (!row) return false;
  const closesAt = Number(row.closes_at);
  const closed = row.closed_at !== null || now >= closesAt;
  const certification = kindleCertification({ status: closed ? 'closed' : 'open', closesAt, now, confirmed: closed, winnerName: null });
  return certification?.transition !== undefined;
}

const fail = (status: 409, reason: 'caretaker', error: string) => ({ ok: false as const, status, reason, error });

/** Admission gate for a Kindle presidential spend from `kindle-treasury`. Call this before any such debit.
 *  During the certified transition week the spend is refused; otherwise it is allowed (this helper does not write). */
export async function refuseKindleTreasurySpend(db: GameDatabase, now: number): Promise<
  { ok: true } | { ok: false; status: 409; reason: 'caretaker'; error: string }
> {
  if (await kindleOutgoingPresidentIsCaretaker(db, now)) return fail(409, 'caretaker', blockedTreasurySpend.caretaker.text);
  return { ok: true as const };
}
