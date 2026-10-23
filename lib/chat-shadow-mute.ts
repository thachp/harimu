/** #790 (docs Moderation & Safety §21.3 "shadow-mute"; ARC rulings on #807): square chat shadow-mute from the operator var HARIMU_CHAT_SHADOW_MUTE,
 *  comma-separated entries `citizenId@muteISO` (an active mute) or `citizenId@muteISO..unmuteISO` (a closed window). Times are ISO 8601 with a zone.
 *  A post by a listed citizen made inside any of their windows (mutedAt <= posted_at < unmutedAt, or no unmutedAt) is still stored and shown to the
 *  author, and hidden from every other viewer, for good. Posts before or after the windows stay visible. To unmute, the operator closes the window
 *  (adds `..unmuteISO`) instead of deleting the entry: deleting an entry would reveal that window again (no table, by ARC's ruling).
 *  The same id may appear more than once; windows of one id must not overlap. Empty entries (trailing or doubled commas) are ignored.
 *  A malformed var fails safe: it mutes nobody and logs a warning. No imports: the plain-node production scripts load this file. */
export const shadowMuteIdPattern = /^[A-Za-z0-9_-]{1,64}$/;
const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
/** At most 90 entries, closed windows included (D1 bound-parameter limit: 100 per query; see readSquare's batching). */
export const SHADOW_MUTE_MAX_IDS = 90;
/** Visible-interval terms per feed query: 4 fixed binds + 3 per term, so 32 terms = 100 binds. */
export const SHADOW_MUTE_TERMS_PER_QUERY = 32;
export const shadowMuteReason = 'operator_shadow_mute';
const reservedWords = new Set(['all', 'true', 'false']);
export type MuteWindow = { from: number; to: number | null };

const time = (text: string): number => { const ms = isoPattern.test(text) ? Date.parse(text) : NaN; return Number.isFinite(ms) ? Math.floor(ms / 1000) : NaN; };
type Parsed = { problem: string | null; entries: Map<string, MuteWindow[]> };
function parse(raw: unknown): Parsed {
  const entries = new Map<string, MuteWindow[]>();
  if (raw === undefined || raw === null) return { problem: null, entries };
  if (typeof raw !== 'string') return { problem: 'must be a string', entries };
  const parts = raw.split(',').map(part => part.trim()).filter(Boolean);
  if (parts.length > SHADOW_MUTE_MAX_IDS) return { problem: `must list at most ${SHADOW_MUTE_MAX_IDS} entries (D1 bound-parameter limit)`, entries };
  for (const part of parts) {
    if (reservedWords.has(part.toLowerCase())) return { problem: 'must list citizenId@ISO8601 entries, not "all", "true" or "false"', entries };
    const at = part.lastIndexOf('@');
    if (at < 0) return { problem: 'must give every entry a mute time (citizenId@ISO8601); bare ids are refused', entries };
    const id = part.slice(0, at), [muteText, unmuteText, extra] = part.slice(at + 1).split('..');
    if (!shadowMuteIdPattern.test(id) || reservedWords.has(id.toLowerCase())) return { problem: 'must use citizen ids of [A-Za-z0-9_-], 1-64 characters', entries };
    const from = time(muteText), to = unmuteText === undefined ? null : time(unmuteText);
    if (extra !== undefined || Number.isNaN(from) || (to !== null && Number.isNaN(to))) return { problem: 'must use ISO 8601 times with a zone (id@2026-10-23T07:00:00Z or id@start..end)', entries };
    if (to !== null && to <= from) return { problem: 'must put the unmute time after the mute time (inverted window)', entries };
    entries.set(id, [...(entries.get(id) ?? []), { from, to }]);
  }
  for (const windows of entries.values()) {
    windows.sort((a, b) => a.from - b.from);
    for (let i = 1; i < windows.length; i++) { const prev = windows[i - 1]; if (prev.to === null || windows[i].from < prev.to) return { problem: 'must not overlap two windows of the same citizen', entries: new Map() }; }
  }
  return { problem: null, entries };
}
/** The ONE rule, shared by parseShadowMute (runtime) and scripts/production-config.mjs (production guard): null when usable, otherwise the reason. */
export function shadowMuteListProblem(raw: unknown): string | null { return parse(raw).problem; }
/** citizenId -> windows (sorted, non-overlapping). Malformed: empty map (mutes nobody) and one warning. */
export function parseShadowMute(raw: unknown, warn: (message: string) => void = message => console.warn(message)): ReadonlyMap<string, readonly MuteWindow[]> {
  const { problem, entries } = parse(raw);
  if (problem) { warn(`HARIMU_CHAT_SHADOW_MUTE is malformed (${problem}); shadow-mute disabled (mutes nobody).`); return new Map(); }
  return entries;
}
/** True when a post by `userId` at `postedAt` falls inside one of their windows. */
export const isShadowMuted = (muted: ReadonlyMap<string, readonly MuteWindow[]>, userId: string, postedAt: number): boolean =>
  (muted.get(userId) ?? []).some(w => postedAt >= w.from && (w.to === null || postedAt < w.to));
/** The visible intervals [from, to) of a listed citizen: the complement of their windows. `end` stands for "no end". */
export function visibleIntervals(windows: readonly MuteWindow[], end: number): [number, number][] {
  const out: [number, number][] = []; let cursor = 0;
  for (const w of windows) { if (w.from > cursor) out.push([cursor, w.from]); cursor = w.to ?? end; }
  if (cursor < end) out.push([cursor, end]);
  return out;
}
/** One structured log line per suppressed message, for staff review (citizen id, message id, reason code; never the message text). */
export function logShadowMuted(userId: string, messageId: string, log: (line: string) => void = line => console.info(line)): void {
  log(JSON.stringify({ event: 'square_chat_shadow_muted', citizenId: userId, messageId, reason: shadowMuteReason }));
}
