/** Certified Tier1 elections remain closed. The separately namespaced,
 * owner-approved development PoC uses signed-in citizens and bounded stored
 * separation, without claiming cryptographic operator unlinkability.
 * Request claims and generic Clerk verification cannot unlock this gate.
 */
export function trustedBallotPrivacyReady(){return false;}
export const ballotPrivacyReason='Ballot privacy has not completed review, so counted voting remains unavailable.';
