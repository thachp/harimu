/** Stored-table separation is not a reviewed end-to-end anonymous voting system.
 * The authenticated submission and DB transaction can permit operator correlation.
 * Do not enable live ballots until the protocol and platform logging are reviewed.
 * Request claims, environment flags and generic Clerk verification cannot unlock it.
 */
export function trustedBallotPrivacyReady(){return false;}
export const ballotPrivacyReason='Ballot privacy has not completed review, so counted voting remains unavailable.';
