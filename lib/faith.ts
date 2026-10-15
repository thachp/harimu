/** #67: citizen faith attribute, Devotion (0-100) and a once-per-game-day "Attend worship" action. Proof of concept behind
 *  HARIMU_FAITH_ENABLED (default "false"). Canon: docs.harimu.com/religion/religion-faiths 14.2 (stances), 14.3 (one faith
 *  change per 60 real days), 14.4 (Faith attribute, Devotion rises with worship and decays slowly, never boosts production
 *  or combat), 14.6 (Korund: Unaffiliated is the only public option, an optional hidden faith). Strings come from Content's
 *  lib/worship-copy.ts (#265) and lib/faith-copy.ts (#259).
 *
 *  Devotion is never stored: it is derived on read from the worship log since the current faith was chosen, so GETs stay
 *  read-only (#217/#246) and only POST attend-worship writes. Nothing in the economy, market, work or combat code reads it. */
import type { GameDatabase } from './database-contract';
import { worshipCopy, type WorshipFaithId } from './worship-copy';
import { devotionTier, faithCopy, unaffiliatedCopy } from './faith-copy';
import { devotionPerFestival, festivalCalendar, festivalJoins, festivalSchemas } from './festivals';
import { mvpFestival } from './mvp-festival-copy';
import { royalFavorBalance, royalFavorBinds, royalFavorSql } from './aurelle';
import { holderCity, readUndergroundView, undergroundHits, undergroundSchemas } from './korund-underground'; // #295
import { korundUndergroundCopy } from './faith-copy';
import { missionarySchemas, readMissionary, isMissionNation } from './missionaries'; // #225

// ---- PoC constants, one place ----
export const gameDaySeconds = 7200; // 12x clock: a game day is 2 real hours (lib/world-simulation.ts)
export const devotionPerWorship = 3;
export const devotionDecayPerGameDay = 1; // per game day without worship
export const devotionMax = 100;
export const faithChangeCooldownSeconds = 60 * 86400; // 60 real days

export type FaithChoice = 'unaffiliated' | WorshipFaithId;
const mvpFaiths: readonly WorshipFaithId[] = ['kinward-rite', 'fair-wind-vow', 'open-hand'];
const allChoices: readonly FaithChoice[] = ['unaffiliated', ...mvpFaiths];

// #490: citizen_faith.nation_id references nations(id) (migration 0049) instead of the literal list of the three live nations; the CHECK stays only so the CHECK count the deploy guard compares does not drop.
export const faithSchemas = [
  `CREATE TABLE IF NOT EXISTS citizen_faith (
 user_id TEXT PRIMARY KEY REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 nation_id TEXT NOT NULL REFERENCES nations(id) CHECK(nation_id <> ''),
 faith_id TEXT NOT NULL CHECK(faith_id IN ('unaffiliated','kinward-rite','fair-wind-vow','open-hand')),
 hidden_faith_id TEXT CHECK(hidden_faith_id IS NULL OR (nation_id='korund' AND hidden_faith_id IN ('kinward-rite','fair-wind-vow','open-hand'))),
 chosen_at INTEGER NOT NULL,
 changed_at INTEGER,
 request_id TEXT NOT NULL UNIQUE
)`,
  `CREATE TABLE IF NOT EXISTS citizen_worship (
 user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 game_day INTEGER NOT NULL,
 faith_id TEXT NOT NULL CHECK(faith_id IN ('kinward-rite','fair-wind-vow','open-hand')),
 worshipped_at INTEGER NOT NULL,
 request_id TEXT NOT NULL UNIQUE,
 PRIMARY KEY(user_id, game_day)
)`,
  ...festivalSchemas, // #68
  ...undergroundSchemas, // #295 (migration 0032)
  ...missionarySchemas, // #225 (migration 0038)
];

/** What each MVP nation lets a citizen hold publicly (14.2). Korund may also hold a hidden faith (14.6). */
export function faithOptions(nationId: string): { public: FaithChoice[]; hidden: WorshipFaithId[] } {
  if (nationId === 'kindle') return { public: [...allChoices], hidden: [] }; // secular pluralism: all free
  if (nationId === 'aurelle') return { public: ['kinward-rite', 'fair-wind-vow', 'open-hand', 'unaffiliated'], hidden: [] }; // state church; others private
  if (nationId === 'korund') return { public: ['unaffiliated'], hidden: [...mvpFaiths] }; // state atheism
  return { public: [], hidden: [] };
}
const defaultFaith = (nationId: string): FaithChoice => nationId === 'aurelle' ? 'kinward-rite' : 'unaffiliated';
/** 14.2: leaving the Kinward Rite in Aurelle costs Royal Favor (#289). Royal Favor is spent for real: one row per spend in aurelle_favor_spends (migration 0028),
 * balance = earned (capped at 100) minus spent, never below 0. Docs give no number: 10 Favor (5 estate shifts) is an [ASSUMPTION] tuning value. */
export const kinwardLeaveFavorCost = 10;
export const kinwardLeaveBlockedReason = (balance: number) => `Leaving the Kinward Rite costs ${kinwardLeaveFavorCost} Royal Favor in Aurelle. You have ${balance}. Serve the Crown to earn more.`;
const leavesKinward = (nationId: string | null | undefined, from: string, to: string) => nationId === 'aurelle' && from === 'kinward-rite' && to !== 'kinward-rite';

export const gameDayOf = (now: number) => Math.floor(now / gameDaySeconds);
/** Devotion from a sorted list of worship game days, evaluated at `today` (pure). */
export function devotionFrom(days: number[], today: number) { return devotionFromEvents(days.map(day => ({ day, amount: devotionPerWorship })), today); }
/** #224: Devotion from dated gains (worship, Officiant service), +amount on each day and -1 per game day without any gain. */
export function devotionFromEvents(events: { day: number; amount: number }[], today: number) {
  const byDay = new Map<number, number>();
  for (const e of events) if (e.day <= today) byDay.set(e.day, (byDay.get(e.day) ?? 0) + e.amount);
  let devotion = 0; let last: number | null = null;
  for (const day of [...byDay.keys()].sort((a, b) => a - b)) {
    if (last !== null) devotion = Math.max(0, devotion - devotionDecayPerGameDay * Math.max(0, day - last - 1));
    devotion = Math.max(0, Math.min(devotionMax, devotion + byDay.get(day)!)); last = day; // #295: a raid's Devotion hit is a negative amount, never below 0
  }
  if (last !== null) devotion = Math.max(0, devotion - devotionDecayPerGameDay * Math.max(0, today - last));
  return devotion;
}
/** #224: Officiant service days for the current faith (table from migration 0026; absent before it is applied). */
export async function serviceDays(db: GameDatabase, userId: string, faithId: string, since: number): Promise<number[]> {
  try { return (await db.prepare('SELECT game_day FROM officiant_service WHERE user_id=? AND faith_id=? AND served_at>=? ORDER BY game_day').bind(userId, faithId, since).all<{ game_day: number }>()).results.map(r => Number(r.game_day)); }
  catch { return []; }
}
export const devotionPerService = 2;

/** #292: Devotion on each game day from the first gain to `today` (pure). Same rules as devotionFromEvents: +amount on a gain day, -1 on a day without one. */
export function devotionSeries(events: { day: number; amount: number }[], today: number): Map<number, number> {
  const byDay = new Map<number, number>(); let first = Infinity;
  for (const e of events) if (e.day <= today) { byDay.set(e.day, (byDay.get(e.day) ?? 0) + e.amount); first = Math.min(first, e.day); }
  const series = new Map<number, number>(); let devotion = 0;
  for (let day = first; day <= today; day++) { const gain = byDay.get(day); devotion = gain ? Math.min(devotionMax, devotion + gain) : Math.max(0, devotion - devotionDecayPerGameDay); series.set(day, devotion); }
  return series;
}
/** #292: consecutive game days, ending at `today`, on which a citizen's Devotion sat at the cap. */
export function capStreak(series: Map<number, number>, today: number): number {
  let streak = 0; for (let day = today; series.get(day) === devotionMax; day--) streak++; return streak;
}
/** #292: the dated Devotion gains for the citizen's current faith (worship, Officiant service, festival joins), the same inputs readFaith uses. */
export async function devotionEvents(db: GameDatabase, userId: string): Promise<{ day: number; amount: number }[]> {
  const citizen = await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string | null }>();
  const nationId = citizen?.nation_id ?? null;
  if (!faithOptions(nationId ?? '').public.length) return [];
  const row = await db.prepare('SELECT faith_id,chosen_at FROM citizen_faith WHERE user_id=? AND nation_id=?').bind(userId, nationId).first<{ faith_id: FaithChoice; chosen_at: number }>();
  const faith = row?.faith_id ?? defaultFaith(nationId!);
  if (faith === 'unaffiliated') return [];
  const since = Number(row?.chosen_at ?? 0);
  const days = (await db.prepare('SELECT game_day FROM citizen_worship WHERE user_id=? AND faith_id=? AND worshipped_at>=? ORDER BY game_day').bind(userId, faith, since).all<{ game_day: number }>()).results.map(r => Number(r.game_day));
  const service = await serviceDays(db, userId, faith, since);
  const festivals = (await festivalJoins(db, userId)).filter(j => j.faith_id === faith && Number(j.joined_at) >= since).map(j => Number(j.game_day));
  return [...days.map(day => ({ day, amount: devotionPerWorship })), ...service.map(day => ({ day, amount: devotionPerService })), ...festivals.map(day => ({ day, amount: devotionPerFestival }))];
}

type FaithRow = { faith_id: FaithChoice; hidden_faith_id: WorshipFaithId | null; chosen_at: number; changed_at: number | null; request_id: string };
const label = (id: FaithChoice) => id === 'unaffiliated' ? unaffiliatedCopy.name : faithCopy[id].name;
const fail = (status: 400 | 403 | 409 | 503, reason: string, error: string) => ({ ok: false as const, status, reason, error });

/** Pure read (GET). The hidden faith is returned only to its holder, labelled private. */
export async function readFaith(db: GameDatabase, userId: string, now: number, enabled: boolean, favorDecayAt?: number) {
  const citizen = await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string | null }>();
  const nationId = citizen?.nation_id ?? null;
  const options = faithOptions(nationId ?? '');
  const supported = options.public.length > 0;
  const row = supported ? await db.prepare('SELECT faith_id,hidden_faith_id,chosen_at,changed_at,request_id FROM citizen_faith WHERE user_id=? AND nation_id=?').bind(userId, nationId).first<FaithRow>() : null;
  const faith = row?.faith_id ?? (supported ? defaultFaith(nationId!) : 'unaffiliated');
  const worshipFaith: WorshipFaithId | null = faith !== 'unaffiliated' ? faith : null; // Korund hidden faiths have no public worship in the PoC
  const today = gameDayOf(now);
  const days = worshipFaith ? (await db.prepare('SELECT game_day FROM citizen_worship WHERE user_id=? AND faith_id=? AND worshipped_at>=? ORDER BY game_day').bind(userId, worshipFaith, row?.chosen_at ?? 0).all<{ game_day: number }>()).results.map(r => Number(r.game_day)) : [];
  const service = worshipFaith ? await serviceDays(db, userId, worshipFaith, row?.chosen_at ?? 0) : [];
  // #289: leaving the Kinward Rite in Aurelle costs Royal Favor; show the cost and balance, and a visible reason when it can't be paid.
  const leaving = leavesKinward(nationId, faith, 'unaffiliated'); const favor = leaving ? await royalFavorBalance(db, userId, favorDecayAt) : 0; // #529: favorDecayAt is set only while HARIMU_FAVOR_DECAY_ENABLED is on
  const joins = supported ? await festivalJoins(db, userId) : [];
  const festivalDays = worshipFaith ? joins.filter(j => j.faith_id === worshipFaith && Number(j.joined_at) >= Number(row?.chosen_at ?? 0)).map(j => Number(j.game_day)) : [];
  const devotion = devotionFromEvents([...days.map(day => ({ day, amount: devotionPerWorship })), ...service.map(day => ({ day, amount: devotionPerService })), ...festivalDays.map(day => ({ day, amount: devotionPerFestival }))], today);
  const calendar = supported ? festivalCalendar(nationId!, worshipFaith, today, gameDaySeconds, new Set(joins.map(j => `${j.festival_id}:${Number(j.occurrence)}`)), enabled) : null;
  // A first pick (including Unaffiliated) is free and starts no cooldown; only a later change does (changed_at).
  const changeAvailableAt = row?.changed_at != null ? Number(row.changed_at) + faithChangeCooldownSeconds : null;
  const changeBlockedReason = !enabled ? 'Faith is not open yet.' : changeAvailableAt !== null && now < changeAvailableAt
    ? `You can change faith once every 60 real days. Next change: ${new Date(changeAvailableAt * 1000).toISOString().slice(0, 10)}.` : null;
  // #295: a Korund citizen's hidden faith has its own private worship log (the same citizen_worship rows, written by worship-underground) and takes Devotion hits from inspections.
  const hiddenFaith: WorshipFaithId | null = enabled && nationId === 'korund' && faith === 'unaffiliated' ? row?.hidden_faith_id ?? null : null;
  const undergroundDays = hiddenFaith ? (await db.prepare('SELECT game_day FROM citizen_worship WHERE user_id=? AND faith_id=? AND worshipped_at>=? ORDER BY game_day').bind(userId, hiddenFaith, row?.chosen_at ?? 0).all<{ game_day: number }>()).results.map(r => Number(r.game_day)) : [];
  const undergroundHitEvents = hiddenFaith ? await undergroundHits(db, userId, Number(row?.chosen_at ?? 0)) : [];
  const undergroundDevotion = hiddenFaith ? devotionFromEvents([...undergroundDays.map(day => ({ day, amount: devotionPerWorship })), ...undergroundHitEvents], today) : null;
  const underground = hiddenFaith ? await undergroundState(db, userId, hiddenFaith, undergroundDays.includes(today), Number(row?.chosen_at ?? 0), today, now) : null;
  // #225: cross-border missionaries (derived on read; null with the flag off or in an unsupported nation).
  // #404: Korund has no public faith (docs 14.6), so it gets no missionary state or block.
  const missionary = enabled && supported && nationId !== 'korund' && isMissionNation(nationId ?? '') ? await readMissionary(db, userId, now, { nationId: nationId!, currentFaith: faith, worshipFaith, devotion, changeAvailableAt }) : null;
  const worshippedToday = days.includes(today);
  const worshipBlockedReason = !enabled ? 'Faith is not open yet.' : !worshipFaith ? (nationId === 'korund' ? 'Public worship is not permitted in Korund.' : 'Choose a faith to attend worship.')
    : worshippedToday ? 'You have already attended worship this game day. Come back tomorrow.' : null;
  return {
    enabled, supported, nationId,
    faith: { id: faith, name: label(faith), chosen: Boolean(row), chosenAt: row ? Number(row.chosen_at) : null },
    hiddenFaith: row?.hidden_faith_id ? { id: row.hidden_faith_id, name: faithCopy[row.hidden_faith_id].name, private: true } : null,
    options: { public: options.public.map(id => ({ id, name: label(id) })), hidden: options.hidden.map(id => ({ id, name: faithCopy[id].name })) },
    devotion: { value: undergroundDevotion ?? devotion, max: devotionMax, tier: worshipFaith ? devotionTier(devotion) : undergroundDevotion !== null ? devotionTier(undergroundDevotion) : null, explanation: 'Devotion gives social standing only. It never changes wages, production, prices or combat.' },
    worship: worshipFaith ? { ...worshipCopy[worshipFaith], gameDay: today, worshippedToday, nextAt: worshippedToday ? (today + 1) * gameDaySeconds : null } : null,
    worshipBlockedReason, changeAvailableAt, changeBlockedReason,
    festivals: calendar?.festivals ?? [], holiday: calendar?.holiday ?? null, banEvents: calendar?.banEvents ?? [], // #68
    missionary, // #225
    underground, // #295: private to the holder; null unless Korund, flag on and a hidden faith is held
    leaveCost: leaving ? kinwardLeaveFavorCost : null, royalFavor: leaving ? favor : null,
    leaveBlockedReason: leaving && favor < kinwardLeaveFavorCost ? kinwardLeaveBlockedReason(favor) : null,
  };
}

/** #295: the holder's private underground-worship state: the action label, whether it can be used today, and what an inspection left (derived on read). */
async function undergroundState(db: GameDatabase, userId: string, faithId: WorshipFaithId, worshippedToday: boolean, since: number, today: number, now: number) {
  const view = await readUndergroundView(db, userId, await holderCity(db, userId), since, now);
  return {
    faithId, label: korundUndergroundCopy.worshipAction.label, worshippedToday,
    blockedReason: worshippedToday ? korundUndergroundCopy.worshipAction.alreadyToday.text : null,
    nextAt: worshippedToday ? (today + 1) * gameDaySeconds : null,
    confirmation: korundUndergroundCopy.worshipAction.confirmation.text,
    lastRaid: view.lastRaid, quietWeek: view.quietWeek, suspicion: view.suspicion, // #382: private indicator (a band word, never the number)
  };
}

const requestOk = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(v);
export function parseFaithCommand(body: Record<string, unknown>) {
  if (!requestOk(body.requestId)) return null;
  if (body.action === 'join-festival' && typeof body.festivalId === 'string' && /^[a-z-]{3,40}$/.test(body.festivalId)) return { action: 'join-festival' as const, requestId: body.requestId, festivalId: body.festivalId };
  if (body.action === 'request-mission' && typeof body.hostNation === 'string' && /^[a-z]{3,20}$/.test(body.hostNation)) return { action: 'request-mission' as const, requestId: body.requestId, hostNation: body.hostNation };
  if (body.action === 'accept-mission') return { action: 'accept-mission' as const, requestId: body.requestId };
  if (body.action === 'answer-mission' && typeof body.missionId === 'string' && /^[A-Za-z0-9-]{8,80}$/.test(body.missionId) && (body.answer === 'accept' || body.answer === 'decline'))
    return { action: 'answer-mission' as const, requestId: body.requestId, missionId: body.missionId, answer: body.answer as 'accept' | 'decline' };
  if (body.action === 'mute-missionaries' && typeof body.muted === 'boolean') return { action: 'mute-missionaries' as const, requestId: body.requestId, muted: body.muted };
  if (body.action === 'worship-underground') return { action: 'worship-underground' as const, requestId: body.requestId };
  if (body.action === 'attend-worship') return { action: 'attend-worship' as const, requestId: body.requestId };
  if (body.action === 'choose-faith' && typeof body.faithId === 'string' && (body.hiddenFaithId === undefined || body.hiddenFaithId === null || typeof body.hiddenFaithId === 'string'))
    return { action: 'choose-faith' as const, requestId: body.requestId, faithId: body.faithId, hiddenFaithId: (body.hiddenFaithId as string | null | undefined) ?? null };
  return null;
}

export async function chooseFaith(db: GameDatabase, userId: string, command: { requestId: string; faithId: string; hiddenFaithId: string | null }, now: number, enabled: boolean, favorDecayAt?: number) {
  if (!enabled) return fail(403, 'disabled', 'Faith is not open yet.');
  const prior = await db.prepare('SELECT user_id,faith_id,hidden_faith_id FROM citizen_faith WHERE request_id=?').bind(command.requestId).first<{ user_id: string; faith_id: string; hidden_faith_id: string | null }>();
  if (prior) {
    if (prior.user_id !== userId || prior.faith_id !== command.faithId || (prior.hidden_faith_id ?? null) !== command.hiddenFaithId) return fail(409, 'request_reused', 'That request id was already used for a different choice.');
    return { ok: true as const, replay: true as const, state: await readFaith(db, userId, now, enabled, favorDecayAt) };
  }
  const citizen = await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string | null }>();
  const options = faithOptions(citizen?.nation_id ?? '');
  if (!options.public.length) return fail(403, 'unsupported_nation', 'Faith choice is available in Kindle, Korund and Aurelle for now.');
  if (!options.public.includes(command.faithId as FaithChoice)) return fail(400, 'not_allowed', citizen?.nation_id === 'korund' ? 'In Korund the only public option is Unaffiliated.' : 'Your nation does not allow that faith.');
  if (command.hiddenFaithId !== null && !options.hidden.includes(command.hiddenFaithId as WorshipFaithId)) return fail(400, 'not_allowed', 'Only Korund citizens may hold a hidden faith.');
  const current = await db.prepare('SELECT nation_id,faith_id,hidden_faith_id,changed_at FROM citizen_faith WHERE user_id=?').bind(userId).first<{ nation_id: string; faith_id: string; hidden_faith_id: string | null; changed_at: number | null }>();
  // The leave check uses the citizen's current nation: a row from a former nation does not count (a move into Aurelle starts on the Kinward Rite).
  const sameNation = current?.nation_id === citizen!.nation_id;
  const currentFaith = sameNation ? current!.faith_id : defaultFaith(citizen!.nation_id!);
  if (sameNation && currentFaith === command.faithId && (current?.hidden_faith_id ?? null) === command.hiddenFaithId) return fail(409, 'unchanged', 'That is already your faith.');
  const leaving = leavesKinward(citizen!.nation_id, currentFaith, command.faithId);
  if (leaving) {
    // citizen_faith.request_id only remembers the latest change, so an older leave id is found through its spend row: it may never debit (or leave) twice.
    if (await spendRowFor(db, command.requestId)) return fail(409, 'request_reused', 'That request id was already used for a Royal Favor spend.');
    const balance = await royalFavorBalance(db, userId, favorDecayAt); if (balance < kinwardLeaveFavorCost) return fail(409, 'insufficient_royal_favor', kinwardLeaveBlockedReason(balance));
  }
  if (current?.changed_at != null && now < Number(current.changed_at) + faithChangeCooldownSeconds) return fail(409, 'cooldown', `You can change faith once every 60 real days. Next change: ${new Date((Number(current.changed_at) + faithChangeCooldownSeconds) * 1000).toISOString().slice(0, 10)}.`);
  // Guarded upsert: a concurrent change inside the cooldown cannot slip through. A first pick (no row, or Aurelle's recorded default) leaves changed_at NULL.
  // Leaving the Kinward Rite debits Royal Favor in the same transactional batch. The spend row is keyed by the request id (a retry cannot debit twice),
  // is only written while the balance covers it and the cooldown allows the change, and the faith change only lands if that spend row exists.
  // #318: a concurrent replay of the same request id never rewrites the row, so it cannot stamp the cooldown on a free first pick.
  const cooldownGuard = 'WHERE (citizen_faith.changed_at IS NULL OR citizen_faith.changed_at <= ?) AND citizen_faith.request_id <> excluded.request_id';
  // #617 [ASSUMPTION]: a leave only lands while the row still says "on the Kinward Rite" (no row to conflict with, a row from another nation, or faith_id kinward-rite). Without this a concurrent leave with another
  // request id conflicts with the first one's fresh row (changed_at NULL, a "first pick"), passes the cooldown guard and charges a second time; now its upsert changes nothing and its own spend row is undone below.
  const leaveStillOnKinward = " AND (citizen_faith.nation_id<>'aurelle' OR citizen_faith.faith_id='kinward-rite')";
  const upsert = (guardSpend: boolean) => db.prepare(`INSERT INTO citizen_faith (user_id,nation_id,faith_id,hidden_faith_id,chosen_at,request_id)
    SELECT clerk_user_id,nation_id,?,?,?,? FROM citizens WHERE clerk_user_id=? AND nation_id=?${guardSpend ? ' AND EXISTS (SELECT 1 FROM aurelle_favor_spends WHERE request_id=? AND clerk_user_id=?)' : ''}
    ON CONFLICT(user_id) DO UPDATE SET nation_id=excluded.nation_id,faith_id=excluded.faith_id,hidden_faith_id=excluded.hidden_faith_id,chosen_at=excluded.chosen_at,
      changed_at=CASE WHEN citizen_faith.request_id LIKE 'default-%' THEN NULL ELSE excluded.chosen_at END,request_id=excluded.request_id
    ${cooldownGuard}${guardSpend ? leaveStillOnKinward : ''}`).bind(command.faithId, command.hiddenFaithId, now, command.requestId, userId, citizen!.nation_id, ...(guardSpend ? [command.requestId, userId] : []), now - faithChangeCooldownSeconds);
  let saved;
  if (leaving) {
    const spend = db.prepare(`INSERT INTO aurelle_favor_spends (request_id,clerk_user_id,amount,reason,spent_at)
      SELECT ?,?,?,'leave-kinward',? WHERE (${royalFavorSql(favorDecayAt)}) >= ?
        AND EXISTS (SELECT 1 FROM citizens WHERE clerk_user_id=? AND nation_id='aurelle')
        AND NOT EXISTS (SELECT 1 FROM citizen_faith f WHERE f.user_id=? AND f.changed_at IS NOT NULL AND f.changed_at > ?)
      ON CONFLICT DO NOTHING`).bind(command.requestId, userId, kinwardLeaveFavorCost, now, ...royalFavorBinds(userId, favorDecayAt), kinwardLeaveFavorCost, userId, userId, now - faithChangeCooldownSeconds);
    let results;
    try { results = await db.batch([spend, upsert(true)]); }
    catch (error) {
      if (!isMissingSpendLedger(error)) throw error; // any other failure is not a Favor problem: never report it as insufficient Favor
      return fail(503, 'favor_ledger_unavailable', 'The Royal Favor ledger is not available yet. Nothing was spent. Try again later.'); // migration 0028 not applied: nothing was changed
    }
    const spent = results[0].meta.changes === 1; // only this call's own spend row may be refunded or may carry the change
    saved = results[1];
    if (!spent || saved.meta.changes !== 1) {
      // Undo only a debit this call wrote (never an earlier call's, so a replayed id can't refund a spend that already landed).
      if (spent) await db.prepare('DELETE FROM aurelle_favor_spends WHERE request_id=? AND clerk_user_id=? AND NOT EXISTS (SELECT 1 FROM citizen_faith WHERE request_id=?)').bind(command.requestId, userId, command.requestId).run();
      const landed = await db.prepare('SELECT user_id FROM citizen_faith WHERE request_id=?').bind(command.requestId).first<{ user_id: string }>();
      if (!spent && landed?.user_id === userId) return { ok: true as const, replay: true as const, state: await readFaith(db, userId, now, enabled, favorDecayAt) }; // a concurrent call with this id already did it
      if (!spent && await spendRowFor(db, command.requestId)) return fail(409, 'request_reused', 'That request id was already used for a Royal Favor spend.');
      const left = await db.prepare('SELECT nation_id,faith_id FROM citizen_faith WHERE user_id=?').bind(userId).first<{ nation_id: string; faith_id: string }>();
      if (left?.nation_id === 'aurelle' && left.faith_id !== 'kinward-rite') return fail(409, 'already_left', 'You have already left the Kinward Rite. Nothing was spent.'); // #617: a concurrent leave landed first
      const balance = await royalFavorBalance(db, userId, favorDecayAt);
      return balance < kinwardLeaveFavorCost ? fail(409, 'insufficient_royal_favor', kinwardLeaveBlockedReason(balance)) : fail(409, 'cooldown', 'You can change faith once every 60 real days.');
    }
  } else {
    saved = await upsert(false).run();
    if (!saved.meta.changes) {
      const landed = await db.prepare('SELECT user_id FROM citizen_faith WHERE request_id=?').bind(command.requestId).first<{ user_id: string }>();
      if (landed?.user_id === userId) return { ok: true as const, replay: true as const, state: await readFaith(db, userId, now, enabled, favorDecayAt) }; // a concurrent call with this id already did it
      return fail(409, 'cooldown', 'You can change faith once every 60 real days.');
    }
  }
  return { ok: true as const, state: await readFaith(db, userId, now, enabled, favorDecayAt) };
}

/** The spend row for a request id (any citizen), or null when there is none or the ledger table does not exist yet. */
async function spendRowFor(db: GameDatabase, requestId: string) {
  try { return await db.prepare('SELECT clerk_user_id FROM aurelle_favor_spends WHERE request_id=?').bind(requestId).first<{ clerk_user_id: string }>(); }
  catch (error) { if (isMissingSpendLedger(error)) return null; throw error; }
}
/** True only when the error is the missing aurelle_favor_spends table (SQLite "no such table", Postgres "relation ... does not exist"). */
export function isMissingSpendLedger(error: unknown): boolean {
  const text = (e: unknown) => String((e as { message?: unknown } | null)?.message ?? e);
  const message = `${text(error)} ${text((error as { cause?: unknown } | null)?.cause ?? '')}`;
  return /aurelle_favor_spends/.test(message) && /no such table|does not exist/i.test(message);
}

export async function attendWorship(db: GameDatabase, userId: string, requestId: string, now: number, enabled: boolean) {
  if (!enabled) return fail(403, 'disabled', 'Faith is not open yet.');
  const prior = await db.prepare('SELECT user_id FROM citizen_worship WHERE request_id=?').bind(requestId).first<{ user_id: string }>();
  if (prior) return prior.user_id === userId ? { ok: true as const, replay: true as const, state: await readFaith(db, userId, now, enabled) } : fail(409, 'request_reused', 'That request id was already used.');
  const state = await readFaith(db, userId, now, enabled);
  if (!state.supported) return fail(403, 'unsupported_nation', 'Worship is available in Kindle, Korund and Aurelle for now.');
  if (!state.worship) return fail(409, 'no_faith', state.worshipBlockedReason ?? 'Choose a faith to attend worship.');
  if (state.worship.worshippedToday) return fail(409, 'already_worshipped', state.worshipBlockedReason!);
  // Aurelle's default Kinward Rite needs no explicit choice; record it so the worship log has a stable start (chosen_at).
  const statements = [];
  if (!state.faith.chosen) statements.push(db.prepare(`INSERT INTO citizen_faith (user_id,nation_id,faith_id,hidden_faith_id,chosen_at,request_id)
    SELECT clerk_user_id,nation_id,?,NULL,0,? FROM citizens WHERE clerk_user_id=? AND nation_id=? ON CONFLICT DO NOTHING`).bind(state.faith.id, `default-${requestId}`, userId, state.nationId));
  statements.push(db.prepare(`INSERT INTO citizen_worship (user_id,game_day,faith_id,worshipped_at,request_id)
    SELECT f.user_id,?,f.faith_id,?,? FROM citizen_faith f WHERE f.user_id=? AND f.faith_id=? ON CONFLICT DO NOTHING`).bind(gameDayOf(now), now, requestId, userId, state.worship.faithId));
  await db.batch(statements);
  const saved = await db.prepare('SELECT user_id FROM citizen_worship WHERE request_id=?').bind(requestId).first<{ user_id: string }>();
  if (!saved) return fail(409, 'already_worshipped', 'You have already attended worship this game day. Come back tomorrow.');
  return { ok: true as const, completion: worshipCopy[state.worship.faithId].completion, state: await readFaith(db, userId, now, enabled) };
}

/** #295: a Korund citizen with a hidden faith worships in private: once per game day, +Devotion, nothing is posted. Unaffiliated-only citizens, other nations and
 *  public worship are refused. The log is citizen_worship (faith = the hidden faith), so the one-per-day rule is the same primary key as public worship. */
export async function worshipUnderground(db: GameDatabase, userId: string, requestId: string, now: number, enabled: boolean) {
  if (!enabled) return fail(403, 'disabled', 'Faith is not open yet.');
  const prior = await db.prepare('SELECT user_id FROM citizen_worship WHERE request_id=?').bind(requestId).first<{ user_id: string }>();
  if (prior) return prior.user_id === userId ? { ok: true as const, replay: true as const, state: await readFaith(db, userId, now, enabled) } : fail(409, 'request_reused', 'That request id was already used.');
  const state = await readFaith(db, userId, now, enabled);
  if (state.nationId !== 'korund') return fail(403, 'unsupported_nation', 'There is no underground worship here.');
  if (!state.underground) return fail(409, 'no_hidden_faith', 'You have no private practice to keep.');
  if (state.underground.worshippedToday) return fail(409, 'already_worshipped', state.underground.blockedReason!);
  await db.batch([db.prepare(`INSERT INTO citizen_worship (user_id,game_day,faith_id,worshipped_at,request_id)
    SELECT f.user_id,?,f.hidden_faith_id,?,? FROM citizen_faith f WHERE f.user_id=? AND f.nation_id='korund' AND f.faith_id='unaffiliated' AND f.hidden_faith_id IS NOT NULL ON CONFLICT DO NOTHING`)
    .bind(gameDayOf(now), now, requestId, userId)]);
  const saved = await db.prepare('SELECT user_id FROM citizen_worship WHERE request_id=?').bind(requestId).first<{ user_id: string }>();
  if (!saved) return fail(409, 'already_worshipped', korundUndergroundCopy.worshipAction.alreadyToday.text);
  return { ok: true as const, completion: korundUndergroundCopy.worshipAction.confirmation.text, state: await readFaith(db, userId, now, enabled) };
}

/** #68: join an active festival of your faith, once per festival occurrence (+Devotion). Not in a banning nation. */
export async function joinFestival(db: GameDatabase, userId: string, command: { requestId: string; festivalId: string }, now: number, enabled: boolean) {
  if (!enabled) return fail(403, 'disabled', 'Faith is not open yet.');
  const prior = await db.prepare('SELECT user_id,festival_id FROM citizen_festival_joins WHERE request_id=?').bind(command.requestId).first<{ user_id: string; festival_id: string }>();
  if (prior) return prior.user_id === userId && prior.festival_id === command.festivalId ? { ok: true as const, replay: true as const, state: await readFaith(db, userId, now, enabled) } : fail(409, 'request_reused', 'That request id was already used.');
  const copy = mvpFestival(command.festivalId);
  if (!copy) return fail(400, 'unknown_festival', 'That festival does not exist.');
  const state = await readFaith(db, userId, now, enabled);
  if (!state.supported) return fail(403, 'unsupported_nation', 'Festivals are held in Kindle, Korund and Aurelle for now.');
  const festival = state.festivals.find(f => f.id === copy.id)!;
  if (festival.joinBlockedReason) return fail(409, festival.stance === 'banned' ? 'banned' : festival.joined ? 'already_joined' : !festival.active ? 'not_active' : 'not_adherent', festival.joinBlockedReason);
  const statements = [];
  // Aurelle's default Kinward Rite needs no explicit choice; record it so Devotion has a stable start (as attend-worship does).
  if (!state.faith.chosen) statements.push(db.prepare(`INSERT INTO citizen_faith (user_id,nation_id,faith_id,hidden_faith_id,chosen_at,request_id)
    SELECT clerk_user_id,nation_id,?,NULL,0,? FROM citizens WHERE clerk_user_id=? AND nation_id=? ON CONFLICT DO NOTHING`).bind(state.faith.id, `default-${command.requestId}`, userId, state.nationId));
  statements.push(db.prepare(`INSERT INTO citizen_festival_joins (user_id,festival_id,occurrence,faith_id,game_day,joined_at,request_id)
    SELECT f.user_id,?,?,f.faith_id,?,?,? FROM citizen_faith f WHERE f.user_id=? AND f.faith_id=? ON CONFLICT DO NOTHING`).bind(copy.id, festival.occurrence, festival.gameDay, now, command.requestId, userId, copy.faithId));
  await db.batch(statements);
  const saved = await db.prepare('SELECT user_id FROM citizen_festival_joins WHERE request_id=?').bind(command.requestId).first<{ user_id: string }>();
  if (!saved) return fail(409, 'already_joined', `You already joined ${copy.name}.`);
  return { ok: true as const, completion: copy.joinToast, state: await readFaith(db, userId, now, enabled) };
}
