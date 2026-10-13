/** Trusted, fresh provider evidence only. Never populate this from request claims or user metadata. */
export type VerificationEvidence = {
  userId: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  phoneUnique: boolean;
  revoked: boolean;
  checkedAt: number;
  expiresAt: number;
};
export type VerificationProvider = { read(userId: string): Promise<VerificationEvidence | null> };
export type VerificationState = {
  tier: 0 | 1;
  countedActionsEligible: boolean;
  status: 'unavailable' | 'required' | 'eligible';
  reason: string;
};

// Clerk SMS and a unique hashed-phone registry require approved production setup.
// Deliberately absent: email/session/user-supplied metadata must never grant Tier 1.
export function trustedVerificationProvider(): VerificationProvider | undefined { return undefined; }

export async function readVerification(userId: string, provider = trustedVerificationProvider(), now = Date.now()): Promise<VerificationState> {
  const denied = (status: 'unavailable' | 'required', reason: string): VerificationState => ({ tier: 0, countedActionsEligible: false, status, reason });
  if (!provider) return denied('unavailable', 'Phone verification is not available yet, so petitions cannot count toward government decisions. Work, trade, chat and private planning remain available.');
  try {
    const evidence = await provider.read(userId);
    if (!evidence || evidence.userId !== userId || evidence.emailVerified !== true || evidence.phoneVerified !== true || evidence.phoneUnique !== true || evidence.revoked !== false ||
      !Number.isFinite(evidence.checkedAt) || !Number.isFinite(evidence.expiresAt) || evidence.checkedAt > now || now - evidence.checkedAt > 60_000 || evidence.expiresAt <= now) {
      return denied('required', 'Verify your email and a phone number used only by your account before submitting petitions that count toward government decisions.');
    }
    return { tier: 1, countedActionsEligible: true, status: 'eligible', reason: 'Your account is verified. Your petitions can count toward government decisions.' };
  } catch { return denied('unavailable', 'Account verification could not be checked. Petitions are temporarily unavailable; try again later.'); }
}
