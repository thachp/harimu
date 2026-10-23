/** #790 (docs Moderation & Safety §21.3 "shadow-mute"): square chat shadow-mute from the operator var HARIMU_CHAT_SHADOW_MUTE, a comma-separated list
 *  of citizen ids (not a secret; empty by default in preview and production). A muted citizen's messages are still stored and shown to themselves,
 *  and hidden from every other viewer. Read-time filter, no table: removing an id from the var makes that citizen's stored messages visible again.
 *  A malformed var fails safe: it mutes nobody and logs a warning. No mod console, bans or appeals (out of scope). */
export const shadowMuteIdPattern = /^[A-Za-z0-9_-]{1,64}$/;
export const SHADOW_MUTE_MAX_IDS = 200;
export const shadowMuteReason = 'operator_shadow_mute';

export function parseShadowMute(raw: unknown, warn: (message: string) => void = message => console.warn(message)): ReadonlySet<string> {
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) return new Set();
  const ids = typeof raw === 'string' ? raw.split(',').map(id => id.trim()).filter(Boolean) : null;
  if (!ids || !ids.length || ids.length > SHADOW_MUTE_MAX_IDS || !ids.every(id => shadowMuteIdPattern.test(id))) {
    warn('HARIMU_CHAT_SHADOW_MUTE is malformed; shadow-mute disabled (mutes nobody).');
    return new Set();
  }
  return new Set(ids);
}
/** One structured log line per suppressed message, for staff review (citizen id, message id, reason code; never the message text). */
export function logShadowMuted(userId: string, messageId: string, log: (line: string) => void = line => console.info(line)): void {
  log(JSON.stringify({ event: 'square_chat_shadow_muted', citizenId: userId, messageId, reason: shadowMuteReason }));
}
