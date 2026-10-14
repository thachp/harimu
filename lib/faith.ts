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

// ---- PoC constants, one place ----
export const gameDaySeconds = 7200; // 12x clock: a game day is 2 real hours (lib/world-simulation.ts)
export const devotionPerWorship = 3;
export const devotionDecayPerGameDay = 1; // per game day without worship
export const devotionMax = 100;
export const faithChangeCooldownSeconds = 60 * 86400; // 60 real days

export type FaithChoice = 'unaffiliated' | WorshipFaithId;
const mvpFaiths: readonly WorshipFaithId[] = ['kinward-rite', 'fair-wind-vow', 'open-hand'];
const allChoices: readonly FaithChoice[] = ['unaffiliated', ...mvpFaiths];

export const faithSchemas = [
  `CREATE TABLE IF NOT EXISTS citizen_faith (
 user_id TEXT PRIMARY KEY REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 nation_id TEXT NOT NULL CHECK(nation_id IN ('kindle','korund','aurelle')),
 faith_id TEXT NOT NULL CHECK(faith_id IN ('unaffiliated','kinward-rite','fair-wind-vow','open-hand')),
 hidden_faith_id TEXT CHECK(hidden_faith_id IS NULL OR (nation_id='korund' AND hidden_faith_id IN ('kinward-rite','fair-wind-vow','open-hand'))),
 chosen_at INTEGER NOT NULL,
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
];

/** What each MVP nation lets a citizen hold publicly (14.2). Korund may also hold a hidden faith (14.6). */
export function faithOptions(nationId: string): { public: FaithChoice[]; hidden: WorshipFaithId[] } {
  if (nationId === 'kindle') return { public: [...allChoices], hidden: [] }; // secular pluralism: all free
  if (nationId === 'aurelle') return { public: ['kinward-rite', 'fair-wind-vow', 'open-hand', 'unaffiliated'], hidden: [] }; // state church; others private
  if (nationId === 'korund') return { public: ['unaffiliated'], hidden: [...mvpFaiths] }; // state atheism
  return { public: [], hidden: [] };
}
const defaultFaith = (nationId: string): FaithChoice => nationId === 'aurelle' ? 'kinward-rite' : 'unaffiliated';

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
    devotion = Math.min(devotionMax, devotion + byDay.get(day)!); last = day;
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

type FaithRow = { faith_id: FaithChoice; hidden_faith_id: WorshipFaithId | null; chosen_at: number; request_id: string };
const label = (id: FaithChoice) => id === 'unaffiliated' ? unaffiliatedCopy.name : faithCopy[id].name;
const fail = (status: 400 | 403 | 409, reason: string, error: string) => ({ ok: false as const, status, reason, error });

/** Pure read (GET). The hidden faith is returned only to its holder, labelled private. */
export async function readFaith(db: GameDatabase, userId: string, now: number, enabled: boolean) {
  const citizen = await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string | null }>();
  const nationId = citizen?.nation_id ?? null;
  const options = faithOptions(nationId ?? '');
  const supported = options.public.length > 0;
  const row = supported ? await db.prepare('SELECT faith_id,hidden_faith_id,chosen_at,request_id FROM citizen_faith WHERE user_id=? AND nation_id=?').bind(userId, nationId).first<FaithRow>() : null;
  const faith = row?.faith_id ?? (supported ? defaultFaith(nationId!) : 'unaffiliated');
  const worshipFaith: WorshipFaithId | null = faith !== 'unaffiliated' ? faith : null; // Korund hidden faiths have no public worship in the PoC
  const today = gameDayOf(now);
  const days = worshipFaith ? (await db.prepare('SELECT game_day FROM citizen_worship WHERE user_id=? AND faith_id=? AND worshipped_at>=? ORDER BY game_day').bind(userId, worshipFaith, row?.chosen_at ?? 0).all<{ game_day: number }>()).results.map(r => Number(r.game_day)) : [];
  const service = worshipFaith ? await serviceDays(db, userId, worshipFaith, row?.chosen_at ?? 0) : [];
  const devotion = devotionFromEvents([...days.map(day => ({ day, amount: devotionPerWorship })), ...service.map(day => ({ day, amount: devotionPerService }))], today);
  const changeAvailableAt = row ? Number(row.chosen_at) + faithChangeCooldownSeconds : null;
  const changeBlockedReason = !enabled ? 'Faith is not open yet.' : changeAvailableAt !== null && now < changeAvailableAt
    ? `You can change faith once every 60 real days. Next change: ${new Date(changeAvailableAt * 1000).toISOString().slice(0, 10)}.` : null;
  const worshippedToday = days.includes(today);
  const worshipBlockedReason = !enabled ? 'Faith is not open yet.' : !worshipFaith ? (nationId === 'korund' ? 'Public worship is not permitted in Korund.' : 'Choose a faith to attend worship.')
    : worshippedToday ? 'You have already attended worship this game day. Come back tomorrow.' : null;
  return {
    enabled, supported, nationId,
    faith: { id: faith, name: label(faith), chosen: Boolean(row), chosenAt: row ? Number(row.chosen_at) : null },
    hiddenFaith: row?.hidden_faith_id ? { id: row.hidden_faith_id, name: faithCopy[row.hidden_faith_id].name, private: true } : null,
    options: { public: options.public.map(id => ({ id, name: label(id) })), hidden: options.hidden.map(id => ({ id, name: faithCopy[id].name })) },
    devotion: { value: devotion, max: devotionMax, tier: worshipFaith ? devotionTier(devotion) : null, explanation: 'Devotion gives social standing only. It never changes wages, production, prices or combat.' },
    worship: worshipFaith ? { ...worshipCopy[worshipFaith], gameDay: today, worshippedToday, nextAt: worshippedToday ? (today + 1) * gameDaySeconds : null } : null,
    worshipBlockedReason, changeAvailableAt, changeBlockedReason,
  };
}

const requestOk = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(v);
export function parseFaithCommand(body: Record<string, unknown>) {
  if (!requestOk(body.requestId)) return null;
  if (body.action === 'attend-worship') return { action: 'attend-worship' as const, requestId: body.requestId };
  if (body.action === 'choose-faith' && typeof body.faithId === 'string' && (body.hiddenFaithId === undefined || body.hiddenFaithId === null || typeof body.hiddenFaithId === 'string'))
    return { action: 'choose-faith' as const, requestId: body.requestId, faithId: body.faithId, hiddenFaithId: (body.hiddenFaithId as string | null | undefined) ?? null };
  return null;
}

export async function chooseFaith(db: GameDatabase, userId: string, command: { requestId: string; faithId: string; hiddenFaithId: string | null }, now: number, enabled: boolean) {
  if (!enabled) return fail(403, 'disabled', 'Faith is not open yet.');
  const prior = await db.prepare('SELECT user_id,faith_id,hidden_faith_id FROM citizen_faith WHERE request_id=?').bind(command.requestId).first<{ user_id: string; faith_id: string; hidden_faith_id: string | null }>();
  if (prior) {
    if (prior.user_id !== userId || prior.faith_id !== command.faithId || (prior.hidden_faith_id ?? null) !== command.hiddenFaithId) return fail(409, 'request_reused', 'That request id was already used for a different choice.');
    return { ok: true as const, replay: true as const, state: await readFaith(db, userId, now, enabled) };
  }
  const citizen = await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string | null }>();
  const options = faithOptions(citizen?.nation_id ?? '');
  if (!options.public.length) return fail(403, 'unsupported_nation', 'Faith choice is available in Kindle, Korund and Aurelle for now.');
  if (!options.public.includes(command.faithId as FaithChoice)) return fail(400, 'not_allowed', citizen?.nation_id === 'korund' ? 'In Korund the only public option is Unaffiliated.' : 'Your nation does not allow that faith.');
  if (command.hiddenFaithId !== null && !options.hidden.includes(command.hiddenFaithId as WorshipFaithId)) return fail(400, 'not_allowed', 'Only Korund citizens may hold a hidden faith.');
  const current = await db.prepare('SELECT faith_id,hidden_faith_id,chosen_at FROM citizen_faith WHERE user_id=?').bind(userId).first<{ faith_id: string; hidden_faith_id: string | null; chosen_at: number }>();
  if (current && current.faith_id === command.faithId && (current.hidden_faith_id ?? null) === command.hiddenFaithId) return fail(409, 'unchanged', 'That is already your faith.');
  if (current && now < Number(current.chosen_at) + faithChangeCooldownSeconds) return fail(409, 'cooldown', `You can change faith once every 60 real days. Next change: ${new Date((Number(current.chosen_at) + faithChangeCooldownSeconds) * 1000).toISOString().slice(0, 10)}.`);
  // Guarded upsert: a concurrent change inside the cooldown cannot slip through.
  const saved = await db.prepare(`INSERT INTO citizen_faith (user_id,nation_id,faith_id,hidden_faith_id,chosen_at,request_id)
    SELECT clerk_user_id,nation_id,?,?,?,? FROM citizens WHERE clerk_user_id=? AND nation_id=?
    ON CONFLICT(user_id) DO UPDATE SET nation_id=excluded.nation_id,faith_id=excluded.faith_id,hidden_faith_id=excluded.hidden_faith_id,chosen_at=excluded.chosen_at,request_id=excluded.request_id
    WHERE citizen_faith.chosen_at <= ?`).bind(command.faithId, command.hiddenFaithId, now, command.requestId, userId, citizen!.nation_id, now - faithChangeCooldownSeconds).run();
  if (!saved.meta.changes) return fail(409, 'cooldown', 'You can change faith once every 60 real days.');
  return { ok: true as const, state: await readFaith(db, userId, now, enabled) };
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
