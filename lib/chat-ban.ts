/** #1517 (docs Moderation & Safety §21.3 "temporary chat bans"; follow-up to #790): chat bans from the operator var HARIMU_CHAT_BAN,
 *  comma-separated entries `citizenId@startISO..endISO`. The end is required (a ban is temporary) and a window may last at most 30 days.
 *  While start <= now < end, the seven chat POST routes refuse the citizen's `post` with 403 chat_banned, and POST /api/square action=presence with active:true is refused the same way; authenticated square GET/POST also delete that citizen's square_presence row so it does not linger until expires_at. Own-post `delete`, presence clear (active:false) and every GET still work.
 *  Same rules as HARIMU_CHAT_SHADOW_MUTE: id pattern, 90-entry cap, reserved words, ISO 8601 with a zone and whole seconds, no overlapping windows
 *  of one id, empty entries ignored. A malformed var fails safe: it bans nobody and logs one warning. No imports (plain-node scripts may load this). */
export const chatBanIdPattern = /^[A-Za-z0-9_-]{1,64}$/;
const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/;
export const CHAT_BAN_MAX_IDS = 90;
export const CHAT_BAN_MAX_SECONDS = 30 * 86400;
export const chatBanReason = 'operator_chat_ban';
const reservedWords = new Set(['all', 'true', 'false']);
export type BanWindow = { from: number; to: number };

const time = (text: string | undefined): number => { const ms = text !== undefined && isoPattern.test(text) ? Date.parse(text) : NaN; return Number.isFinite(ms) ? Math.floor(ms / 1000) : NaN; };
type Parsed = { problem: string | null; entries: Map<string, BanWindow[]> };
function parse(raw: unknown): Parsed {
  const entries = new Map<string, BanWindow[]>(), fail = (problem: string): Parsed => ({ problem, entries: new Map() });
  if (raw === undefined || raw === null) return { problem: null, entries };
  if (typeof raw !== 'string') return fail('must be a string');
  const parts = raw.split(',').map(part => part.trim()).filter(Boolean);
  if (parts.length > CHAT_BAN_MAX_IDS) return fail(`must list at most ${CHAT_BAN_MAX_IDS} entries`);
  for (const part of parts) {
    if (reservedWords.has(part.toLowerCase())) return fail('must list citizenId@start..end entries, not "all", "true" or "false"');
    const at = part.lastIndexOf('@');
    if (at < 0) return fail('must give every entry a window (citizenId@start..end); bare ids are refused');
    const id = part.slice(0, at), [startText, endText, extra] = part.slice(at + 1).split('..');
    if (!chatBanIdPattern.test(id) || reservedWords.has(id.toLowerCase())) return fail('must use citizen ids of [A-Za-z0-9_-], 1-64 characters');
    if (endText === undefined) return fail('must give every ban an end time (citizenId@start..end); a ban is temporary');
    const from = time(startText), to = time(endText);
    if (extra !== undefined || Number.isNaN(from) || Number.isNaN(to)) return fail('must use ISO 8601 times with a zone and whole seconds (id@2026-10-23T07:00:00Z..2026-10-24T07:00:00Z)');
    if (to <= from) return fail('must put the end time after the start time (inverted window)');
    if (to - from > CHAT_BAN_MAX_SECONDS) return fail('must keep every window to at most 30 days');
    entries.set(id, [...(entries.get(id) ?? []), { from, to }]);
  }
  for (const windows of entries.values()) {
    windows.sort((a, b) => a.from - b.from);
    for (let i = 1; i < windows.length; i++) if (windows[i].from < windows[i - 1].to) return fail('must not overlap two windows of the same citizen');
  }
  return { problem: null, entries };
}
/** The one rule: null when usable, otherwise the reason. */
export function chatBanListProblem(raw: unknown): string | null { return parse(raw).problem; }
/** citizenId -> windows (sorted, non-overlapping). Malformed: empty map (bans nobody) and one warning. */
export function parseChatBan(raw: unknown, warn: (message: string) => void = message => console.warn(message)): ReadonlyMap<string, readonly BanWindow[]> {
  const { problem, entries } = parse(raw);
  if (problem) { warn(`HARIMU_CHAT_BAN is malformed (${problem}); chat bans disabled (bans nobody).`); return new Map(); }
  return entries;
}
/** The end (unix seconds) of the window containing `now` (start <= now < end), or null. */
export const chatBanUntil = (bans: ReadonlyMap<string, readonly BanWindow[]>, userId: string, now: number): number | null =>
  (bans.get(userId) ?? []).find(w => now >= w.from && now < w.to)?.to ?? null;
/** Citizen ids whose window contains `now`. Empty when the var is unset, empty, or malformed (bans nobody). */
export const chatBanActiveIds = (raw: unknown, now: number): string[] => {
  if (raw === undefined || raw === '') return [];
  const bans = parseChatBan(raw);
  return [...bans.keys()].filter(id => chatBanUntil(bans, id, now) !== null);
};
/** Route helper: the 403 body for a banned poster (and one structured log line, never the message text), or null. */
export function chatBanRefusal(raw: unknown, userId: string, now: number, channel: string, log: (line: string) => void = line => console.info(line)): { reason: 'chat_banned'; error: string } | null {
  if (raw === undefined || raw === '') return null;
  const until = chatBanUntil(parseChatBan(raw), userId, now);
  if (until === null) return null;
  log(JSON.stringify({ event: 'chat_ban_refused', citizenId: userId, channel, reason: chatBanReason }));
  return { reason: 'chat_banned', error: `You can't post in chat until ${new Date(until * 1000).toISOString().replace('.000Z', 'Z')}.` };
}
