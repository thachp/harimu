/** #225: pure rules for cross-border missionaries (no imports, so tests can load this file directly). Canon: harimu-docs 14.8 (missionaries are live from Early
 *  Access in the MVP three; one invitation per citizen per 14 real days [ASSUMPTION in the docs]; at most one faith change per 60 real days (14.3); a full mute
 *  option; conversion only if the citizen accepts; host permission: free in pluralist nations, Kinward Rite only in Aurelle with other faiths private-only, banned
 *  in Korund), 14.3 (no leader, system or missionary can change a citizen's faith; only the player chooses) and 27 (MVP Scope, Religion row). Times are epoch seconds.
 *  Every number is a docs figure, an issue #225 figure, or an [ASSUMPTION] marked here. */
export const missionaryConfig = {
  /** Issue #225: Devotion of at least 40 in an MVP faith to send a missionary. The docs give no threshold. */
  minDevotion: 40,
  /** Issue #225: the "Missionary" badge shows in the host city for up to 3 game days (a game day is 2 real hours, lib/faith.ts gameDaySeconds). */
  presenceGameDays: 3,
  gameDaySeconds: 7200,
  /** [ASSUMPTION] An issued invitation (the host's permission) waits 24 real hours for the missionary to accept before it lapses. The docs name no figure. */
  inviteTtlSeconds: 86400,
  /** Docs 14.8 [ASSUMPTION in the docs]: a citizen receives at most one missionary invitation per 14 real days. */
  invitationGapSeconds: 14 * 86400,
} as const;
export const presenceSeconds = () => missionaryConfig.presenceGameDays * missionaryConfig.gameDaySeconds;

export const missionNations = ['kindle', 'aurelle', 'korund'] as const;
export type MissionNation = typeof missionNations[number];
export const missionFaiths = ['kinward-rite', 'fair-wind-vow', 'open-hand'] as const;
export type MissionFaith = typeof missionFaiths[number];
export const isMissionNation = (v: unknown): v is MissionNation => typeof v === 'string' && (missionNations as readonly string[]).includes(v);
export const isMissionFaith = (v: unknown): v is MissionFaith => typeof v === 'string' && (missionFaiths as readonly string[]).includes(v);

export type HostDecision = { allowed: true } | { allowed: false; reason: 'unknown_nation' | 'same_nation' | 'host_banned' | 'host_private_only' };
/** Docs 14.8 / issue #225: may a missionary of `faith` from `home` preach in `host`? Never in the home nation (cross-border only). */
export function hostDecision(home: string, host: string, faith: string): HostDecision {
  if (!isMissionNation(home) || !isMissionNation(host) || !isMissionFaith(faith)) return { allowed: false, reason: 'unknown_nation' };
  if (home === host) return { allowed: false, reason: 'same_nation' };
  if (host === 'korund') return { allowed: false, reason: 'host_banned' };
  if (host === 'aurelle' && faith !== 'kinward-rite') return { allowed: false, reason: 'host_private_only' };
  return { allowed: true };
}

export type MissionTimes = { expiresAt: number; acceptedAt: number | null; arrivesAt: number | null; endsAt: number | null };
export type MissionStatus = 'invited' | 'lapsed' | 'traveling' | 'present' | 'over';
/** Derived from the clock, so reads never write: invited (waiting for the missionary) -> lapsed, or traveling -> present -> over. */
export function missionStatus(m: MissionTimes, now: number): MissionStatus {
  if (m.acceptedAt === null) return now < m.expiresAt ? 'invited' : 'lapsed';
  if (m.arrivesAt === null || m.endsAt === null) return 'over';
  if (now < m.arrivesAt) return 'traveling';
  return now < m.endsAt ? 'present' : 'over';
}
/** One active mission per citizen: an invitation still waiting, or a mission still traveling or present. */
export const missionActive = (m: MissionTimes, now: number) => { const s = missionStatus(m, now); return s === 'invited' || s === 'traveling' || s === 'present'; };
/** When a citizen may be invited again (null: now), given the time of their last answer. */
export const nextInvitationAt = (lastAnsweredAt: number | null) => lastAnsweredAt === null ? null : lastAnsweredAt + missionaryConfig.invitationGapSeconds;
export const invitationAllowed = (lastAnsweredAt: number | null, now: number) => lastAnsweredAt === null || now >= lastAnsweredAt + missionaryConfig.invitationGapSeconds;

/** [ASSUMPTION] Interface labels for the missionary's own side. Content's #355 copy covers the host citizen's card and the notices, not these buttons; they are server-sent
 *  like all other missionary strings (app/ never imports copy) and can move to Content's files without touching the UI. Docs 14.8 names the invitation flow only. */
export const missionaryLabels = {
  heading: 'Missionaries',
  intro: 'Send a missionary of your faith to another capital. Citizens there may accept the invitation. They are never converted automatically.',
  send: (host: string) => `Send a missionary to ${host}`,
  setOut: 'Accept the invitation and set out',
  statusText: (status: MissionStatus, host: string) => status === 'invited' ? `${host} has received your missionary. Accept the invitation to set out.`
    : status === 'traveling' ? `Your missionary is on the way to ${host}.` : status === 'present' ? `Your missionary is preaching in ${host}.` : 'This mission has ended.',
  here: (faith: string) => `A missionary of ${faith} is in your city.`,
} as const;
