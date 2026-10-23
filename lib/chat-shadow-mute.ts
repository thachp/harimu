/** #790 (docs Moderation & Safety §21.3 "shadow-mute"; ARC: new messages only): square chat shadow-mute from the operator var HARIMU_CHAT_SHADOW_MUTE,
 *  a comma-separated list of `citizenId@ISO8601` entries (not a secret; empty by default in preview and production). A post by a listed citizen made
 *  at or after their mutedAt is still stored and shown to the author, and hidden from every other viewer; their earlier posts stay visible.
 *  Read-time filter, no table: removing an entry (unmuting) makes the posts hidden during the mute visible again. Keeping them hidden after an
 *  unmute needs a stored record, i.e. a table and a migration, which this PR deliberately does not add.
 *  A malformed var fails safe: it mutes nobody and logs a warning. No mod console, bans or appeals (out of scope). No imports: the plain-node
 *  production scripts load this file. */
export const shadowMuteIdPattern = /^[A-Za-z0-9_-]{1,64}$/;
const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
/** At most 90 entries (D1 bound-parameter limit: 100 per query). The feed query binds 4 plus one per muted id (90 -> 94), and the pre-mute
 *  lookups bind 4 plus two per entry in chunks of SHADOW_MUTE_CHUNK (45 -> 94). */
export const SHADOW_MUTE_MAX_IDS = 90;
export const SHADOW_MUTE_CHUNK = 45;
export const shadowMuteReason = 'operator_shadow_mute';
const reservedWords = new Set(['all', 'true', 'false']);

type Parsed = { problem: string | null; entries: Map<string, number> };
function parse(raw: unknown): Parsed {
  const entries = new Map<string, number>();
  if (raw === undefined || raw === null) return { problem: null, entries };
  if (typeof raw !== 'string') return { problem: 'must be a string', entries };
  if (raw.trim() === '') return { problem: null, entries };
  const parts = raw.split(',').map(part => part.trim());
  if (parts.length > SHADOW_MUTE_MAX_IDS) return { problem: `must list at most ${SHADOW_MUTE_MAX_IDS} entries (D1 bound-parameter limit)`, entries };
  for (const part of parts) {
    if (reservedWords.has(part.toLowerCase())) return { problem: 'must list citizenId@ISO8601 entries, not "all", "true" or "false"', entries };
    const at = part.lastIndexOf('@'), id = at < 0 ? part : part.slice(0, at), when = at < 0 ? '' : part.slice(at + 1);
    if (at < 0) return { problem: 'must give every entry a mute time (citizenId@ISO8601); bare ids are refused', entries };
    if (!shadowMuteIdPattern.test(id) || reservedWords.has(id.toLowerCase())) return { problem: 'must use citizen ids of [A-Za-z0-9_-], 1-64 characters', entries };
    const ms = isoPattern.test(when) ? Date.parse(when) : NaN;
    if (!Number.isFinite(ms)) return { problem: 'must use an ISO 8601 time with a zone (e.g. 2026-10-23T07:00:00Z)', entries };
    if (entries.has(id)) return { problem: 'must list each citizen once', entries };
    entries.set(id, Math.floor(ms / 1000));
  }
  return { problem: null, entries };
}
/** The ONE rule, shared by parseShadowMute (runtime) and scripts/production-config.mjs (production guard): null when usable, otherwise the reason. */
export function shadowMuteListProblem(raw: unknown): string | null { return parse(raw).problem; }
/** citizenId -> mutedAt (epoch seconds). Malformed: empty map (mutes nobody) and one warning. */
export function parseShadowMute(raw: unknown, warn: (message: string) => void = message => console.warn(message)): ReadonlyMap<string, number> {
  const { problem, entries } = parse(raw);
  if (problem) { warn(`HARIMU_CHAT_SHADOW_MUTE is malformed (${problem}); shadow-mute disabled (mutes nobody).`); return new Map(); }
  return entries;
}
/** True when a post by `userId` at `postedAt` is shadow-muted. */
export const isShadowMuted = (muted: ReadonlyMap<string, number>, userId: string, postedAt: number): boolean => { const at = muted.get(userId); return at !== undefined && postedAt >= at; };
/** One structured log line per suppressed message, for staff review (citizen id, message id, reason code; never the message text). */
export function logShadowMuted(userId: string, messageId: string, log: (line: string) => void = line => console.info(line)): void {
  log(JSON.stringify({ event: 'square_chat_shadow_muted', citizenId: userId, messageId, reason: shadowMuteReason }));
}
