/** #350: who may declare or propose to end a war, per nation (pure, no imports so tests can load this file directly).
 *  ARC's final ruling on #350 (docs 13.1: every negotiator and ratifying body is an AI persona or AI body):
 *    Kindle  - the President proposes; the ratifier "assembly majority" is DATA ONLY here (no Assembly vote is built; see the follow-up issue).
 *              [ASSUMPTION] a Kindle declaration is recorded as a President proposal and takes effect when the President's call is accepted by the server.
 *    Korund  - the Chairman alone.   Aurelle - the Monarch, by decree.
 *  The acting role is validated against this table; the caller itself is a server-only caller (no citizen session). */
export const warAuthorityNations = ['kindle', 'korund', 'aurelle'] as const;
export type WarAuthorityNation = typeof warAuthorityNations[number];
export type WarAuthorityMode = 'proposal' | 'decree';
export const warAuthority: Readonly<Record<WarAuthorityNation, { office: string; mode: WarAuthorityMode; ratifier: string }>> = {
  kindle: { office: 'President', mode: 'proposal', ratifier: 'assembly majority' },
  korund: { office: 'Chairman', mode: 'decree', ratifier: 'chairman alone' },
  aurelle: { office: 'Monarch', mode: 'decree', ratifier: 'royal decree' },
};
export type WarAuthorityResult = { ok: true; office: string; mode: WarAuthorityMode; ratifier: string } | { ok: false; reason: 'unknown_nation' | 'wrong_role' };
/** The role must be exactly the nation's office (case and surrounding spaces ignored). Anything else, including another nation's office, is refused. */
export function authorizeWarRole(nation: unknown, role: unknown): WarAuthorityResult {
  if (typeof nation !== 'string' || !(warAuthorityNations as readonly string[]).includes(nation)) return { ok: false, reason: 'unknown_nation' };
  const entry = warAuthority[nation as WarAuthorityNation];
  if (typeof role !== 'string' || role.trim().toLowerCase() !== entry.office.toLowerCase()) return { ok: false, reason: 'wrong_role' };
  return { ok: true, ...entry };
}
export const warEndKinds = ['ceasefire', 'peace'] as const;
export type WarEndRequestKind = typeof warEndKinds[number];
export const isWarEndKind = (value: unknown): value is WarEndRequestKind => typeof value === 'string' && (warEndKinds as readonly string[]).includes(value);
/** Constant-time check of a "Bearer <secret>" header against the server secret. A missing or short (under 16 characters) secret never authorizes (fail closed). */
export async function bearerMatches(header: string | null, secret: string | undefined): Promise<boolean> {
  if (typeof secret !== 'string' || secret.length < 16 || !header) return false;
  const match = /^Bearer (.+)$/.exec(header.trim()); if (!match) return false;
  const digest = async (text: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  const [a, b] = [await digest(match[1]), await digest(secret)];
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
