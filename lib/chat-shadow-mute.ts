/** #790 (docs Moderation & Safety §21.3 "shadow-mute"): square chat shadow-mute from the operator var HARIMU_CHAT_SHADOW_MUTE, a comma-separated list
 *  of citizen ids (not a secret; empty by default in preview and production). A muted citizen's messages are still stored and shown to themselves,
 *  and hidden from every other viewer. Read-time filter, no table: removing an id from the var makes that citizen's stored messages visible again.
 *  A malformed var fails safe: it mutes nobody and logs a warning. No mod console, bans or appeals (out of scope). */
export const shadowMuteIdPattern = /^[A-Za-z0-9_-]{1,64}$/;
/** D1 allows at most 100 bound parameters per query; the feed binds 4 of its own plus one per muted id, so the list is capped at 90. */
export const SHADOW_MUTE_MAX_IDS = 90;
export const shadowMuteReason = 'operator_shadow_mute';
const reservedWords = new Set(['all', 'true', 'false']);

/** The ONE rule for HARIMU_CHAT_SHADOW_MUTE, shared by parseShadowMute (runtime) and scripts/production-config.mjs (production guard):
 *  null when the value is usable ("" or a comma list of 1..90 citizen ids), otherwise the reason. "all", "true" and "false" (any case, whole value
 *  or as an id) are refused: they look like switches but would mute nobody. No imports, so the plain-node production scripts can load it. */
export function shadowMuteListProblem(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') return 'must be a string';
  if (raw.trim() === '') return null;
  const ids = raw.split(',').map(id => id.trim());
  if (ids.some(id => reservedWords.has(id.toLowerCase()))) return 'must list citizen ids, not "all", "true" or "false"';
  if (!ids.every(id => shadowMuteIdPattern.test(id))) return 'must be a comma list of citizen ids ([A-Za-z0-9_-], 1-64 characters)';
  if (ids.length > SHADOW_MUTE_MAX_IDS) return `must list at most ${SHADOW_MUTE_MAX_IDS} ids (D1 bound-parameter limit)`;
  return null;
}

export function parseShadowMute(raw: unknown, warn: (message: string) => void = message => console.warn(message)): ReadonlySet<string> {
  const problem = shadowMuteListProblem(raw);
  if (problem) { warn(`HARIMU_CHAT_SHADOW_MUTE is malformed (${problem}); shadow-mute disabled (mutes nobody).`); return new Set(); }
  return typeof raw === 'string' && raw.trim() ? new Set(raw.split(',').map(id => id.trim())) : new Set();
}
/** One structured log line per suppressed message, for staff review (citizen id, message id, reason code; never the message text). */
export function logShadowMuted(userId: string, messageId: string, log: (line: string) => void = line => console.info(line)): void {
  log(JSON.stringify({ event: 'square_chat_shadow_muted', citizenId: userId, messageId, reason: shadowMuteReason }));
}
