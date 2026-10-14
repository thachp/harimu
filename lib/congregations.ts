/** #224: congregations and one clergy office ("Officiant") for the three MVP faiths. Proof of concept behind
 *  HARIMU_FAITH_ENABLED (default "false"), built on #67's faith attribute and Devotion. Canon: docs.harimu.com
 *  religion/religion-faiths 14.4 (Congregations, Clergy roles; Devotion never boosts production or combat).
 *
 *  - One congregation per MVP faith per MVP capital (Kinward Rite, Fair-Wind Vow, Open Hand x Kindle, Korund, Aurelle
 *    capitals). Korund congregations exist in the catalog but cannot be joined: public practice is banned (14.6).
 *  - Join / Leave: one membership change per citizen per game day, idempotent per requestId.
 *  - A membership counts only while the citizen still holds that faith (public) and still lives in that capital, so a
 *    faith change or a move ends it on read without any write.
 *  - Officiant: members may opt in. An empty or invalid seat goes to the highest-Devotion opted-in member; a holder can be
 *    challenged by a higher-Devotion opted-in member once they have held it 7 game days. The seat is written only on POST;
 *    GET projects who would hold it now, so GET never writes (#217/#246).
 *  - The Officiant may "officiate" once per game day for a small Devotion bonus (lib/faith.ts devotionPerService). Nothing
 *    in work, wages, the market or combat reads any of this. */
import type { GameDatabase } from './database-contract';
import { capitalCityForNation } from './cities';
import { faithCopy } from './faith-copy';
import { gameDayOf, readFaith } from './faith';
import type { WorshipFaithId } from './worship-copy';

export const officiantChallengeGameDays = 7;
export const congregationFaiths: readonly WorshipFaithId[] = ['kinward-rite', 'fair-wind-vow', 'open-hand'];
export const congregationNations = ['kindle', 'korund', 'aurelle'] as const;

export const congregationSchemas = [
  `CREATE TABLE IF NOT EXISTS congregation_members (
 user_id TEXT PRIMARY KEY REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 congregation_id TEXT NOT NULL,
 faith_id TEXT NOT NULL CHECK(faith_id IN ('kinward-rite','fair-wind-vow','open-hand')),
 city_id TEXT NOT NULL,
 officiant_opt_in INTEGER NOT NULL DEFAULT 0 CHECK(officiant_opt_in IN (0,1)),
 joined_at INTEGER NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS idx_congregation_members_congregation ON congregation_members(congregation_id)`,
  `CREATE TABLE IF NOT EXISTS congregation_changes (
 user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 game_day INTEGER NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('join','leave')),
 congregation_id TEXT NOT NULL,
 changed_at INTEGER NOT NULL,
 request_id TEXT NOT NULL UNIQUE,
 PRIMARY KEY(user_id, game_day)
)`,
  `CREATE TABLE IF NOT EXISTS congregation_officiants (
 congregation_id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 since_day INTEGER NOT NULL,
 seated_at INTEGER NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS officiant_service (
 user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 game_day INTEGER NOT NULL,
 faith_id TEXT NOT NULL CHECK(faith_id IN ('kinward-rite','fair-wind-vow','open-hand')),
 congregation_id TEXT NOT NULL,
 served_at INTEGER NOT NULL,
 request_id TEXT NOT NULL UNIQUE,
 PRIMARY KEY(user_id, game_day)
)`,
];

export function congregationId(faithId: string, nationId: string) { const c = capitalCityForNation(nationId); return c ? `${faithId}:${c.id}` : null; }
export function congregationCatalog() {
  return congregationNations.flatMap(nationId => { const city = capitalCityForNation(nationId)!;
    return congregationFaiths.map(faithId => ({ id: `${faithId}:${city.id}`, faithId, faithName: faithCopy[faithId].name, nationId, cityId: city.id, cityName: city.name, joinable: nationId !== 'korund' })); });
}
const fail = (status: 400 | 403 | 409, reason: string, error: string) => ({ ok: false as const, status, reason, error });

type MemberRow = { user_id: string; display_name: string; officiant_opt_in: number; joined_at: number };
/** Members still valid now: same public faith, same nation, home city is the congregation's capital (a missing location row means the capital). */
async function validMembers(db: GameDatabase, cong: { id: string; faithId: string; nationId: string; cityId: string }) {
  return (await db.prepare(`SELECT m.user_id,c.display_name,m.officiant_opt_in,m.joined_at FROM congregation_members m
    JOIN citizens c ON c.clerk_user_id=m.user_id AND c.nation_id=?
    JOIN citizen_faith f ON f.user_id=m.user_id AND f.faith_id=m.faith_id AND f.nation_id=c.nation_id
    LEFT JOIN citizen_city_locations l ON l.user_id=m.user_id AND l.nation_id=c.nation_id
    WHERE m.congregation_id=? AND m.faith_id=? AND COALESCE(l.home_city_id,?)=? ORDER BY m.joined_at,m.user_id`)
    .bind(cong.nationId, cong.id, cong.faithId, cong.cityId, cong.cityId).all<MemberRow>()).results;
}
const devotionOf = async (db: GameDatabase, userId: string, now: number) => (await readFaith(db, userId, now, true)).devotion.value;

/** Who holds the seat now (pure read). Returns the stored holder while valid, else the projected successor. */
async function officiantFor(db: GameDatabase, cong: { id: string; faithId: string; nationId: string; cityId: string }, now: number, members?: MemberRow[]) {
  const list = members ?? await validMembers(db, cong);
  const seat = await db.prepare('SELECT user_id,since_day FROM congregation_officiants WHERE congregation_id=?').bind(cong.id).first<{ user_id: string; since_day: number }>();
  const holder = seat ? list.find(m => m.user_id === seat.user_id) : undefined;
  if (holder) return { userId: holder.user_id, name: holder.display_name, sinceDay: Number(seat!.since_day), stored: true };
  const ranked = await rankOptIns(db, list, now);
  return ranked[0] ? { userId: ranked[0].user_id, name: ranked[0].display_name, sinceDay: gameDayOf(now), stored: false } : null;
}
async function rankOptIns(db: GameDatabase, list: MemberRow[], now: number) {
  const opted = await Promise.all(list.filter(m => Number(m.officiant_opt_in) === 1).map(async m => ({ ...m, devotion: await devotionOf(db, m.user_id, now) })));
  return opted.sort((a, b) => b.devotion - a.devotion || Number(a.joined_at) - Number(b.joined_at) || a.user_id.localeCompare(b.user_id));
}

/** GET: the city faith panel. Headcount and Officiant name for every congregation, plus the viewer's own membership. Read-only. */
export async function readCongregations(db: GameDatabase, userId: string | null, now: number, enabled: boolean) {
  const congregations = await Promise.all(congregationCatalog().map(async cong => {
    const members = enabled ? await validMembers(db, cong) : [];
    const officiant = enabled ? await officiantFor(db, cong, now, members) : null;
    return { ...cong, members: members.length, officiant: officiant ? { name: officiant.name, sinceGameDay: officiant.sinceDay } : null };
  }));
  let you = null;
  if (userId && enabled) {
    const row = await db.prepare('SELECT congregation_id,officiant_opt_in FROM congregation_members WHERE user_id=?').bind(userId).first<{ congregation_id: string; officiant_opt_in: number }>();
    const cong = row ? congregationCatalog().find(c => c.id === row.congregation_id) : undefined;
    const valid = cong ? (await validMembers(db, cong)).some(m => m.user_id === userId) : false;
    const changedToday = await db.prepare('SELECT 1 AS x FROM congregation_changes WHERE user_id=? AND game_day=?').bind(userId, gameDayOf(now)).first();
    const officiant = cong && valid ? await officiantFor(db, cong, now) : null;
    const served = await db.prepare('SELECT 1 AS x FROM officiant_service WHERE user_id=? AND game_day=?').bind(userId, gameDayOf(now)).first();
    you = { congregationId: valid ? cong!.id : null, officiantOptIn: valid && Number(row!.officiant_opt_in) === 1, isOfficiant: officiant?.userId === userId,
      officiatedToday: Boolean(served), changeBlockedReason: changedToday ? 'You can join or leave a congregation once per game day. Come back tomorrow.' : null };
  }
  return { enabled, congregations, you, officiantChallengeGameDays,
    explanation: 'Congregations and clergy office give social standing only. They never change wages, production, prices or combat.' };
}

const requestOk = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(v);
export type CongregationCommand = { action: 'join' | 'leave' | 'stand' | 'stand-down' | 'officiate'; requestId: string };
export function parseCongregationCommand(body: Record<string, unknown>): CongregationCommand | null {
  if (!requestOk(body.requestId)) return null;
  const map: Record<string, CongregationCommand['action']> = { 'join-congregation': 'join', 'leave-congregation': 'leave', 'stand-for-officiant': 'stand', 'stand-down': 'stand-down', officiate: 'officiate' };
  const action = typeof body.action === 'string' ? map[body.action] : undefined;
  return action ? { action, requestId: body.requestId } : null;
}

/** POST. Every write is guarded so retries and concurrent calls are safe. */
export async function runCongregationCommand(db: GameDatabase, userId: string, command: CongregationCommand, now: number, enabled: boolean) {
  if (!enabled) return fail(403, 'disabled', 'Congregations are not open yet.');
  const done = async (extra: Record<string, unknown> = {}) => ({ ok: true as const, ...extra, state: await readCongregations(db, userId, now, enabled) });
  const today = gameDayOf(now);
  if (command.action === 'join' || command.action === 'leave') {
    const prior = await db.prepare('SELECT user_id,action FROM congregation_changes WHERE request_id=?').bind(command.requestId).first<{ user_id: string; action: string }>();
    if (prior) return prior.user_id === userId && prior.action === command.action ? done({ replay: true }) : fail(409, 'request_reused', 'That request id was already used.');
    if (await db.prepare('SELECT 1 AS x FROM congregation_changes WHERE user_id=? AND game_day=?').bind(userId, today).first())
      return fail(409, 'once_per_day', 'You can join or leave a congregation once per game day. Come back tomorrow.');
  }
  const faith = await readFaith(db, userId, now, true);
  const member = await db.prepare('SELECT congregation_id FROM congregation_members WHERE user_id=?').bind(userId).first<{ congregation_id: string }>();
  const own = member ? congregationCatalog().find(c => c.id === member.congregation_id) : undefined;
  const ownValid = own ? (await validMembers(db, own)).some(m => m.user_id === userId) : false;

  if (command.action === 'join') {
    if (!faith.supported) return fail(403, 'unsupported_nation', 'Congregations are open in Kindle and Aurelle for now.');
    if (faith.nationId === 'korund') return fail(403, 'not_permitted', 'Public congregations are not permitted in Korund.');
    if (!faith.worship) return fail(409, 'no_faith', 'Choose a faith to join its congregation.');
    if (!faith.faith.chosen) return fail(409, 'no_faith', 'Confirm your faith first (choose it or attend worship once).');
    const target = congregationCatalog().find(c => c.id === congregationId(faith.faith.id, faith.nationId!))!;
    const home = await db.prepare('SELECT home_city_id FROM citizen_city_locations WHERE user_id=? AND nation_id=?').bind(userId, faith.nationId).first<{ home_city_id: string }>();
    if (home && home.home_city_id !== target.cityId) return fail(409, 'wrong_city', `This congregation meets in ${target.cityName}. Live there to join.`);
    if (ownValid && own!.id === target.id) return fail(409, 'already_member', 'You are already a member of this congregation.');
    await db.batch([
      db.prepare(`INSERT INTO congregation_changes (user_id,game_day,action,congregation_id,changed_at,request_id) VALUES (?,?,'join',?,?,?) ON CONFLICT DO NOTHING`).bind(userId, today, target.id, now, command.requestId),
      db.prepare(`INSERT INTO congregation_members (user_id,congregation_id,faith_id,city_id,officiant_opt_in,joined_at)
        SELECT user_id,congregation_id,?,?,0,? FROM congregation_changes WHERE request_id=? AND user_id=?
        ON CONFLICT(user_id) DO UPDATE SET congregation_id=excluded.congregation_id,faith_id=excluded.faith_id,city_id=excluded.city_id,officiant_opt_in=0,joined_at=excluded.joined_at`)
        .bind(target.faithId, target.cityId, now, command.requestId, userId),
    ]);
    return recorded(db, userId, command, done);
  }
  if (command.action === 'leave') {
    if (!member) return fail(409, 'not_member', 'You are not in a congregation.');
    await db.batch([
      db.prepare(`INSERT INTO congregation_changes (user_id,game_day,action,congregation_id,changed_at,request_id) VALUES (?,?,'leave',?,?,?) ON CONFLICT DO NOTHING`).bind(userId, today, member.congregation_id, now, command.requestId),
      db.prepare('DELETE FROM congregation_officiants WHERE user_id=? AND EXISTS(SELECT 1 FROM congregation_changes WHERE request_id=? AND user_id=?)').bind(userId, command.requestId, userId),
      db.prepare('DELETE FROM congregation_members WHERE user_id=? AND EXISTS(SELECT 1 FROM congregation_changes WHERE request_id=? AND user_id=?)').bind(userId, command.requestId, userId),
    ]);
    return recorded(db, userId, command, done);
  }
  if (!own || !ownValid) return fail(409, 'not_member', 'Join your congregation first.');
  if (command.action === 'stand-down') {
    await db.batch([db.prepare('UPDATE congregation_members SET officiant_opt_in=0 WHERE user_id=?').bind(userId), db.prepare('DELETE FROM congregation_officiants WHERE user_id=?').bind(userId)]);
    return done();
  }
  if (command.action === 'stand') {
    await db.prepare('UPDATE congregation_members SET officiant_opt_in=1 WHERE user_id=?').bind(userId).run();
    const seated = await settleSeat(db, own, now);
    return done({ seated: seated === userId });
  }
  // officiate
  const served = await db.prepare('SELECT user_id FROM officiant_service WHERE request_id=?').bind(command.requestId).first<{ user_id: string }>();
  if (served) return served.user_id === userId ? done({ replay: true }) : fail(409, 'request_reused', 'That request id was already used.');
  if ((await settleSeat(db, own, now)) !== userId) return fail(403, 'not_officiant', 'Only the Officiant can lead today\'s service.');
  await db.prepare(`INSERT INTO officiant_service (user_id,game_day,faith_id,congregation_id,served_at,request_id)
    SELECT o.user_id,?,?,o.congregation_id,?,? FROM congregation_officiants o WHERE o.congregation_id=? AND o.user_id=? ON CONFLICT DO NOTHING`)
    .bind(today, own.faithId, now, command.requestId, own.id, userId).run();
  const saved = await db.prepare('SELECT 1 AS x FROM officiant_service WHERE request_id=?').bind(command.requestId).first();
  return saved ? done() : fail(409, 'already_officiated', 'You have already led a service this game day.');
}

async function recorded(db: GameDatabase, userId: string, command: CongregationCommand, done: (e?: Record<string, unknown>) => Promise<unknown>) {
  const row = await db.prepare('SELECT user_id FROM congregation_changes WHERE request_id=?').bind(command.requestId).first<{ user_id: string }>();
  if (row?.user_id !== userId) return fail(409, 'once_per_day', 'You can join or leave a congregation once per game day. Come back tomorrow.');
  return done() as Promise<{ ok: true }>;
}

/** Latches the seat (POST only): fills an empty or invalid seat, or hands it to a higher-Devotion challenger after 7 game days. */
async function settleSeat(db: GameDatabase, cong: { id: string; faithId: string; nationId: string; cityId: string }, now: number) {
  const list = await validMembers(db, cong);
  const ranked = await rankOptIns(db, list, now);
  const seat = await db.prepare('SELECT user_id,since_day FROM congregation_officiants WHERE congregation_id=?').bind(cong.id).first<{ user_id: string; since_day: number }>();
  const holder = seat ? ranked.find(m => m.user_id === seat.user_id) : undefined;
  const top = ranked[0];
  const today = gameDayOf(now);
  let next: string | null = holder?.user_id ?? null;
  if (!holder) next = top?.user_id ?? null;
  else if (top && top.user_id !== holder.user_id && top.devotion > holder.devotion && today - Number(seat!.since_day) >= officiantChallengeGameDays) next = top.user_id;
  if (next === (seat?.user_id ?? null) && holder) return next;
  if (!next) { if (seat) await db.prepare('DELETE FROM congregation_officiants WHERE congregation_id=? AND user_id=?').bind(cong.id, seat.user_id).run(); return null; }
  // Compare-and-set on the previous holder so two concurrent settles can't both win.
  if (seat) await db.prepare('UPDATE congregation_officiants SET user_id=?,since_day=?,seated_at=? WHERE congregation_id=? AND user_id=?').bind(next, today, now, cong.id, seat.user_id).run();
  else await db.prepare('INSERT INTO congregation_officiants (congregation_id,user_id,since_day,seated_at) VALUES (?,?,?,?) ON CONFLICT DO NOTHING').bind(cong.id, next, today, now).run();
  return (await db.prepare('SELECT user_id FROM congregation_officiants WHERE congregation_id=?').bind(cong.id).first<{ user_id: string }>())?.user_id ?? null;
}
