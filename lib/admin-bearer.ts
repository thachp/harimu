import { reconciliationConfig } from './ledger-reconciliation-rules';

/** Constant-time check of an "Authorization: Bearer <secret>" header against a server secret. A missing or short secret never authorizes (fail closed).
 *  Same behavior as the war admin helper in #429 (not on dev yet); the two can be merged into one later. The token is never logged or returned. */
export async function bearerMatches(header: string | null, secret: string | undefined): Promise<boolean> {
  if (typeof secret !== 'string' || secret.length < reconciliationConfig.minAdminTokenLength || !header) return false;
  const match = /^Bearer (.+)$/.exec(header.trim());
  if (!match) return false;
  const digest = async (text: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  const [a, b] = [await digest(match[1]), await digest(secret)];
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
