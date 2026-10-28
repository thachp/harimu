/** #943 (docs §20, follow-up to #879/#941): mirror Clerk email signals we may already keep, then fold them into the staff-review risk score.
 *  Read-only against Clerk: uses the existing CLERK_SECRET_KEY via users.getUser. No dashboard, SMS, Bot Detection, or new secret.
 *  Signals kept: disposable-email domain (code blocklist) and plus-sub-address in the local part. Device/IP/ASN need Clerk products we have not enabled — out of this slice.
 *  Human review only. Flag HARIMU_CLERK_RISK_SIGNALS_ENABLED ("true" preview / "false" production). Off: no Clerk call and no signal rows written. */
import type { GameDatabase } from './database-contract';

export const clerkRiskSignalsEnabled = (env: { HARIMU_CLERK_RISK_SIGNALS_ENABLED?: string } | null | undefined) =>
  env?.HARIMU_CLERK_RISK_SIGNALS_ENABLED === 'true';

/** [ASSUMPTION] short public disposable-domain list for a code-only check. Not Clerk's blocklist product. */
export const disposableEmailDomains = Object.freeze(['mailinator.com', 'guerrillamail.com', 'tempmail.com', 'temp-mail.org', '10minutemail.com', 'yopmail.com', 'trashmail.com', 'sharklasers.com']);

export type ClerkEmailAssessment = { email: string | null; disposable: boolean; subAddress: boolean; flagged: boolean };

/** Pure: plus-tag in the local part (a+b@x) and disposable domains. Empty / malformed emails are not flagged. */
export function assessClerkEmail(email: string | null | undefined): ClerkEmailAssessment {
  if (typeof email !== 'string') return { email: null, disposable: false, subAddress: false, flagged: false };
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.indexOf('@');
  if (at <= 0 || at === trimmed.length - 1 || trimmed.includes(' ')) return { email: null, disposable: false, subAddress: false, flagged: false };
  const local = trimmed.slice(0, at), domain = trimmed.slice(at + 1);
  const subAddress = local.includes('+');
  const disposable = (disposableEmailDomains as readonly string[]).includes(domain);
  return { email: trimmed, disposable, subAddress, flagged: disposable || subAddress };
}

export const clerkRiskSignalsSchema = `CREATE TABLE IF NOT EXISTS clerk_risk_signals (
 clerk_user_id TEXT NOT NULL PRIMARY KEY REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 disposable_email INTEGER NOT NULL CHECK(disposable_email IN (0,1)),
 sub_address INTEGER NOT NULL CHECK(sub_address IN (0,1)),
 updated_at INTEGER NOT NULL
)`;

export const upsertClerkRiskSignalSql = `INSERT INTO clerk_risk_signals (clerk_user_id, disposable_email, sub_address, updated_at) VALUES (?,?,?,?)
ON CONFLICT(clerk_user_id) DO UPDATE SET disposable_email=excluded.disposable_email, sub_address=excluded.sub_address, updated_at=excluded.updated_at`;

/** Persist an assessment for an enrolled citizen. Does not call Clerk. */
export async function storeClerkRiskSignal(db: GameDatabase, userId: string, assessment: ClerkEmailAssessment, now: number): Promise<ClerkEmailAssessment> {
  await db.prepare(upsertClerkRiskSignalSql).bind(userId, assessment.disposable ? 1 : 0, assessment.subAddress ? 1 : 0, now).run();
  return assessment;
}

/** Read-only Clerk lookup of the primary email. Returns null when the secret is unset, the user is missing, or Clerk errors — never throws to the caller. */
export async function fetchClerkPrimaryEmail(env: { CLERK_SECRET_KEY?: string; NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?: string }, userId: string): Promise<string | null> {
  if (!env.CLERK_SECRET_KEY || !env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return null;
  try {
    const { createClerkClient } = await import('@clerk/backend'); // dynamic: local fixtures forbid a static @clerk/backend import
    const user = await createClerkClient({ secretKey: env.CLERK_SECRET_KEY, publishableKey: env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY }).users.getUser(userId);
    const primary = user.emailAddresses.find(e => e.id === user.primaryEmailAddressId) ?? user.emailAddresses[0];
    return primary?.emailAddress ?? null;
  } catch {
    return null;
  }
}

/** Flag-on path: fetch email from Clerk (or use `emailOverride` in tests), assess, mirror. Flag off: no-op, no DB write. */
export async function refreshClerkRiskSignal(
  db: GameDatabase,
  userId: string,
  env: { HARIMU_CLERK_RISK_SIGNALS_ENABLED?: string; CLERK_SECRET_KEY?: string; NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?: string },
  now: number,
  emailOverride?: string | null,
): Promise<ClerkEmailAssessment | null> {
  if (!clerkRiskSignalsEnabled(env)) return null;
  const email = emailOverride !== undefined ? emailOverride : await fetchClerkPrimaryEmail(env, userId);
  return storeClerkRiskSignal(db, userId, assessClerkEmail(email), now);
}
