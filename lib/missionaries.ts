/** #225: cross-border missionaries, behind HARIMU_FAITH_ENABLED (default "false"). Canon: harimu-docs 14.8 (see lib/missionary-rules.ts).
 *  Flow: a citizen with Devotion >= 40 in a public MVP faith asks for an invitation to one other nation's capital; the host's stance decides (Kindle yes,
 *  Aurelle only the Kinward Rite, Korund refuses). The missionary accepts the issued invitation, travels (a timer from the capital-to-capital distance,
 *  independent of the intra-nation travel flag), then holds a "Missionary" badge in the host capital for up to 3 game days. Host-capital citizens of another faith
 *  (or Unaffiliated) see the invitation and may Accept once: the conversion is lib/faith.ts chooseFaith, so the 60-real-day change cooldown, the Kinward
 *  Royal Favor cost and the host's allowed faiths all apply. Nobody is converted automatically. A citizen can mute missionaries entirely.
 *  Everything a citizen sees is derived on read (status from the clock), so GETs write nothing; only POST actions write (lib/missionary-actions.ts).
 *  Missionary status has no wage, production, market or combat effect: nothing here reads or writes those tables (a test covers it).
 *  The missions and responses tables are the log of missionary actions. Strings come from Content's lib/missionary-copy.ts (#266) and
 *  lib/missionary-notice-copy.ts (#340); the app never imports them: the server sends the strings (as for #295). */
import type { GameDatabase } from './database-contract';
import { isMissingRelation } from './db-errors';
import { capitalCityForNation } from './cities';
import { mvpNations } from './map-zones';
import { travelSeconds } from './travel';
import { faithCopy } from './faith-copy';
import { acceptStepLines, hostPermissionNotices, invitationCopy, muteCopy, type HostNationId, type MissionFaithId } from './missionary-copy';
import { missionaryCooldowns, missionaryOutcomes } from './missionary-notice-copy';
import { hostDecision, invitationAllowed, isMissionFaith, isMissionNation, missionActive, missionaryConfig as cfg, missionaryLabels, missionNations, missionStatus, nextInvitationAt, presenceSeconds,
  type MissionNation, type MissionStatus } from './missionary-rules';

export * from './missionary-rules';

export const missionarySchemas = [
  `CREATE TABLE IF NOT EXISTS faith_missions (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 faith_id TEXT NOT NULL CHECK(faith_id IN ('kinward-rite','fair-wind-vow','open-hand')),
 home_nation TEXT NOT NULL CHECK(home_nation IN ('kindle','korund','aurelle')),
 host_nation TEXT NOT NULL CHECK(host_nation IN ('kindle','korund','aurelle')),
 host_city_id TEXT NOT NULL,
 requested_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 accepted_at INTEGER,
 arrives_at INTEGER,
 ends_at INTEGER,
 closed_at INTEGER,
 request_id TEXT NOT NULL UNIQUE,
 accept_request_id TEXT UNIQUE,
 CHECK(home_nation<>host_nation),
 CHECK((accepted_at IS NULL)=(arrives_at IS NULL) AND (accepted_at IS NULL)=(ends_at IS NULL))
)`,
  // One open mission per citizen. A finished one is closed by the next request, in the same batch, before the new row is inserted.
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_faith_missions_one_open ON faith_missions(user_id) WHERE closed_at IS NULL',
  'CREATE INDEX IF NOT EXISTS idx_faith_missions_host ON faith_missions(host_nation, host_city_id, arrives_at)',
  `CREATE TABLE IF NOT EXISTS missionary_responses (
 user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 mission_id TEXT NOT NULL,
 outcome TEXT NOT NULL CHECK(outcome IN ('accepted','declined')),
 responded_at INTEGER NOT NULL,
 request_id TEXT NOT NULL UNIQUE,
 PRIMARY KEY(user_id, mission_id)
)`,
  'CREATE INDEX IF NOT EXISTS idx_missionary_responses_user ON missionary_responses(user_id, responded_at)',
  `CREATE TABLE IF NOT EXISTS missionary_mutes (
 user_id TEXT PRIMARY KEY REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 muted_at INTEGER NOT NULL
)`,
];

export type MissionRow = { id: string; user_id: string; faith_id: MissionFaithId; home_nation: MissionNation; host_nation: MissionNation; host_city_id: string; requested_at: number; expires_at: number;
  accepted_at: number | null; arrives_at: number | null; ends_at: number | null; closed_at: number | null; request_id: string; accept_request_id: string | null };
export const missionColumns = 'id,user_id,faith_id,home_nation,host_nation,host_city_id,requested_at,expires_at,accepted_at,arrives_at,ends_at,closed_at,request_id,accept_request_id';
export const missionTimes = (row: MissionRow) => ({ expiresAt: Number(row.expires_at), acceptedAt: row.accepted_at === null ? null : Number(row.accepted_at),
  arrivesAt: row.arrives_at === null ? null : Number(row.arrives_at), endsAt: row.ends_at === null ? null : Number(row.ends_at) });

export const nationName: Readonly<Record<MissionNation, string>> = { kindle: 'Kindle', aurelle: 'Aurelle', korund: 'Korund' };
const isoDate = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10);
const fill = (text: string, values: Record<string, string>) => text.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
export const faithName = (id: string) => isMissionFaith(id) ? faithCopy[id].name : id;
export const hostCityId = (nation: MissionNation) => capitalCityForNation(nation)?.id ?? nation;
/** Seconds a missionary travels between two capitals: the existing travel formula (5 real minutes per square, capped at 1 hour), capital to capital. */
export function missionTravelSeconds(home: MissionNation, host: MissionNation): number | null {
  // #491: a nation with no capital on the map (every flag-off nation) has no travel time; callers treat null as "not available" instead of throwing.
  const a = mvpNations.find(n => n.id === home)?.capital, b = mvpNations.find(n => n.id === host)?.capital;
  return a && b ? travelSeconds(a, b) : null;
}
/** Why a host refuses a faith, from Content's host-permission notices (#266); null when it allows it. */
export function hostRefusal(home: string, host: string, faith: string): string | null {
  const decision = hostDecision(home, host, faith);
  if (decision.allowed) return null;
  if (decision.reason === 'host_banned') return hostPermissionNotices.korund[0].text;
  if (decision.reason === 'host_private_only') return hostPermissionNotices.aurelle[0].text;
  if (decision.reason === 'same_nation') return 'A missionary preaches abroad. Pick another nation.';
  return 'That nation does not take missionaries.';
}

/** The citizen's city: where they currently are in their nation (migration city-location table), else their capital. */
export async function citizenCity(db: GameDatabase, userId: string, nationId: string): Promise<string> {
  try {
    const row = await db.prepare('SELECT current_city_id FROM citizen_city_locations WHERE user_id=? AND nation_id=?').bind(userId, nationId).first<{ current_city_id: string }>();
    if (row?.current_city_id) return String(row.current_city_id);
  } catch (error) { if (!isMissingRelation(error)) throw error; }
  return hostCityId(nationId as MissionNation);
}
export async function lastAnswerAt(db: GameDatabase, userId: string): Promise<number | null> {
  try { const row = await db.prepare('SELECT MAX(responded_at) AS at FROM missionary_responses WHERE user_id=?').bind(userId).first<{ at: number | null }>(); return row?.at == null ? null : Number(row.at); }
  catch (error) { if (isMissingRelation(error)) return null; throw error; }
}
export async function isMuted(db: GameDatabase, userId: string): Promise<boolean> {
  try { return Boolean(await db.prepare('SELECT user_id FROM missionary_mutes WHERE user_id=?').bind(userId).first()); }
  catch (error) { if (isMissingRelation(error)) return false; throw error; }
}
/** The citizen's own open mission (invited, traveling or present), or null. */
export async function openMission(db: GameDatabase, userId: string, now: number): Promise<MissionRow | null> {
  try {
    const rows = (await db.prepare(`SELECT ${missionColumns} FROM faith_missions WHERE user_id=? AND closed_at IS NULL`).bind(userId).all<MissionRow>()).results;
    return rows.find(row => missionActive(missionTimes(row), now)) ?? null;
  } catch (error) { if (isMissingRelation(error)) return null; throw error; }
}
/** Missions present now in a host city (anonymous: no user id leaves the server). */
export async function presentMissions(db: GameDatabase, host: string, cityId: string, now: number): Promise<MissionRow[]> {
  try {
    return (await db.prepare(`SELECT ${missionColumns} FROM faith_missions WHERE host_nation=? AND host_city_id=? AND accepted_at IS NOT NULL AND arrives_at<=? AND ends_at>? ORDER BY arrives_at,id LIMIT 5`)
      .bind(host, cityId, now, now).all<MissionRow>()).results;
  } catch (error) { if (isMissingRelation(error)) return []; throw error; }
}

export type MissionaryContext = { nationId: string; currentFaith: string; worshipFaith: string | null; devotion: number; changeAvailableAt: number | null };
const statusLine = (status: MissionStatus) => status;

/** Pure read (GET). The citizen's own mission and request options, the badge for missionaries present in their city, and the invitation they may answer. */
export async function readMissionary(db: GameDatabase, userId: string, now: number, ctx: MissionaryContext) {
  const own = await openMission(db, userId, now);
  const muted = await isMuted(db, userId);
  const hosts = missionNations.filter(n => n !== ctx.nationId).map(host => {
    const reason = ctx.worshipFaith ? hostRefusal(ctx.nationId, host, ctx.worshipFaith) : null;
    return { nationId: host, name: nationName[host], allowed: reason === null, reason };
  });
  const devotionReason = !ctx.worshipFaith ? 'Choose a public faith before you can send a missionary.' : ctx.devotion < cfg.minDevotion ? `Reach ${cfg.minDevotion} Devotion before you can send a missionary abroad. You have ${ctx.devotion}.` : null;
  const requestBlockedReason = own ? 'You already have a mission. Finish it before you start another.' : devotionReason;
  const mission = own ? (() => {
    const times = missionTravelSeconds(own.home_nation, own.host_nation);
    return { id: own.id, faithId: own.faith_id, faithName: faithName(own.faith_id), hostNation: own.host_nation, hostName: nationName[own.host_nation], status: statusLine(missionStatus(missionTimes(own), now)), statusText: missionaryLabels.statusText(missionStatus(missionTimes(own), now), nationName[own.host_nation]),
      requestedAt: Number(own.requested_at), expiresAt: Number(own.expires_at), arrivesAt: own.arrives_at === null ? null : Number(own.arrives_at), endsAt: own.ends_at === null ? null : Number(own.ends_at), travelSeconds: times };
  })() : null;
  // Citizens of the host capital see who is present (anonymous: the faith only) and may be invited.
  const city = isMissionNation(ctx.nationId) ? await citizenCity(db, userId, ctx.nationId) : null;
  const present = city && isMissionNation(ctx.nationId) ? (await presentMissions(db, ctx.nationId, city, now)).filter(row => row.user_id !== userId) : [];
  const here = present.map(row => ({ missionId: row.id, faithId: row.faith_id, faithName: faithName(row.faith_id), until: Number(row.ends_at) }));
  let offer: null | { missionId: string; faithId: string; faithName: string; pitch: string; body: string; buttons: { accept: string; notNow: string; mute: string }; warnings: string[] } = null;
  let notice: string | null = null;
  let target: MissionRow | undefined;
  if (!muted) for (const row of present) if (row.faith_id !== ctx.currentFaith && !(await answered(db, userId, row.id))) { target = row; break; }
  if (target) {
    const lastAt = await lastAnswerAt(db, userId);
    if (!invitationAllowed(lastAt, now)) notice = fill(missionaryCooldowns.invitation.text, { readyAt: isoDate(nextInvitationAt(lastAt)!) });
    else if (ctx.changeAvailableAt !== null && now < ctx.changeAvailableAt) notice = fill(missionaryCooldowns.faithChange.text, { readyAt: isoDate(ctx.changeAvailableAt) });
    else {
      const card = invitationCopy[target.faith_id];
      offer = { missionId: target.id, faithId: target.faith_id, faithName: faithName(target.faith_id), pitch: card.pitch, body: card.body, buttons: { ...card.buttons },
        warnings: acceptStepLines(ctx.nationId as HostNationId, ctx.currentFaith === 'unaffiliated' ? null : ctx.currentFaith, target.faith_id).map(line => line.text) };
    }
  }
  return {
    minDevotion: cfg.minDevotion, presenceGameDays: cfg.presenceGameDays, mission,
    request: { blockedReason: requestBlockedReason, hosts },
    here: here.map(h => ({ ...h, line: missionaryLabels.here(h.faithName) })), offer, notice, muted, labels: { heading: missionaryLabels.heading, intro: missionaryLabels.intro, setOut: missionaryLabels.setOut, send: Object.fromEntries(missionNations.map(n => [n, missionaryLabels.send(nationName[n])])) as Record<string, string> }, mute: { label: muteCopy.label.text, muted: muteCopy.muted.text, unmuted: muteCopy.unmuted.text },
  };
}
export async function answered(db: GameDatabase, userId: string, missionId: string): Promise<boolean> {
  try { return Boolean(await db.prepare('SELECT user_id FROM missionary_responses WHERE user_id=? AND mission_id=?').bind(userId, missionId).first()); }
  catch (error) { if (isMissingRelation(error)) return false; throw error; }
}
export const outcomeText = {
  success: (faith: string) => fill(missionaryOutcomes.success.text, { faith }),
  declined: missionaryOutcomes.declined.text,
  failure: missionaryOutcomes.failure.text,
};
export { presenceSeconds };
