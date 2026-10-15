import type { VerificationState } from './verification';

/** #520: the one eligibility rule behind the Kindle ballot-style routes (Assembly, primaries, town hall, canvassing, debate). Pure: the caller reads the verification and says whether the
 *  approved account-level preview exception applies. With it, a signed-in Kindle citizen is eligible (scope `preview-citizen`, the route's own wording); without it the citizen must be Tier 1
 *  (`countedActionsEligible`; scope `tier1`, the verification's own reason). Each route keeps deciding `preview` its own way (the Assembly and primaries by their ballot scope, the others
 *  from the preview settings) and keeps its own wording; only the rule itself lives here. */
export type KindleEligibility = { eligible: boolean; scope: 'preview-citizen' | 'tier1'; reason: string; verification: VerificationState };
/** The preview wording the town hall, canvassing and debate share. */
export const previewParticipationReason = 'Signed-in Kindle citizens may take part in this preview PoC.';
export function kindleEligibility(verification: VerificationState, preview: { on: boolean; reason: string }): KindleEligibility {
  if (preview.on) return { eligible: true, scope: 'preview-citizen', reason: preview.reason, verification };
  return { eligible: verification.countedActionsEligible, scope: 'tier1', reason: verification.reason, verification };
}
