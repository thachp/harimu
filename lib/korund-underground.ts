/** #295: Korund underground worship and capped inspections (raids), behind HARIMU_FAITH_ENABLED (default "false"). Docs 14.6 and 27.
 *  - Underground worship is the existing citizen_worship log, written by lib/faith.ts for a Korund citizen's hidden faith (once per game day,
 *    +Devotion, nothing is posted). Public worship in Korund stays refused.
 *  - An inspection is written only by the world tick (runKorundRaids, called from advanceWorld, which GET /api/world, POST /api/citizen, POST /api/market/orders and POST /api/aurelle/rising trigger); GET /api/faith, /api/news and GET /api/citizen never write one. It is capped to one per city per
 *    14 real days (see underground-rules.ts), costs each found holder a small Devotion hit, and leaves a State Media rumor that names no faith,
 *    shrine or person. It has no wage, production, market or combat effect: nothing here reads or writes those tables (a test covers it).
 *  - Everything a citizen or the news sees is derived on read from korund_raids / korund_raid_hits. Strings come from Content's lib/faith-copy.ts (#322). */
import type { GameDatabase } from './database-contract';
import { isMissingRelation } from './db-errors';
import { capitalCityForNation, cityForNation } from './cities';
import { korundUndergroundCopy as copy } from './faith-copy';
import { correctionDuty, dutyEnded, suspicionIndicator } from './korund-suspicion-copy';
import { appealGranted, deriveDuties, dutyDays, isRepeatDiscovery, suspicionBand, suspicionLevel, suspicionLevelWithGray, suspicionWord, pickIndex, raidDue, raidId, undergroundConfig as cfg, undergroundGameDay } from './underground-rules';

export * from './underground-rules';

export const undergroundSchemas = [
  `CREATE TABLE IF NOT EXISTS korund_raids (
 id TEXT PRIMARY KEY,
 city_id TEXT NOT NULL,
 game_day INTEGER NOT NULL,
 raided_at INTEGER NOT NULL,
 UNIQUE(city_id, game_day)
)`,
  `CREATE TABLE IF NOT EXISTS korund_raid_hits (
 raid_id TEXT NOT NULL REFERENCES korund_raids(id),
 user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 game_day INTEGER NOT NULL,
 raided_at INTEGER NOT NULL,
 devotion_hit INTEGER NOT NULL CHECK(devotion_hit BETWEEN 0 AND 10),
 PRIMARY KEY(raid_id, user_id)
)`,
  `CREATE TABLE IF NOT EXISTS korund_duty_appeals (
 user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 duty_started_at INTEGER NOT NULL,
 appealed_at INTEGER NOT NULL,
 granted INTEGER NOT NULL CHECK(granted IN (0,1)),
 request_id TEXT NOT NULL UNIQUE,
 PRIMARY KEY(user_id, duty_started_at)
)`, // #382 PR B (migration 0056)
  'CREATE INDEX IF NOT EXISTS idx_korund_raids_at ON korund_raids(raided_at)',
  'CREATE INDEX IF NOT EXISTS idx_korund_raid_hits_user ON korund_raid_hits(user_id, raided_at)',
];

const korundCapital = () => capitalCityForNation('korund')?.id ?? '';
const fillCity = (text: string, cityId: string) => text.replaceAll('{city}', cityForNation('korund', cityId)?.name ?? 'the city');
/** The holder-and-city join used by both the tick and its candidate scan: a Korund citizen whose public faith is Unaffiliated and who holds a hidden faith. */
const holderFrom = `citizen_faith f LEFT JOIN citizen_city_locations l ON l.user_id=f.user_id AND l.nation_id='korund'`;
const holderWhere = `f.nation_id='korund' AND f.faith_id='unaffiliated' AND f.hidden_faith_id IS NOT NULL`;
const recentWorship = `EXISTS (SELECT 1 FROM citizen_worship w WHERE w.user_id=f.user_id AND w.faith_id=f.hidden_faith_id AND w.worshipped_at>=f.chosen_at AND w.worshipped_at>=?)`;

/** World tick: for each Korund city with recent underground worship, roll the discovery chance for this game day; on a hit, and only if the
 *  city has not been inspected in the last 14 real days, record the inspection and a Devotion hit for each holder there. One atomic batch per city;
 *  idempotent (the raid id is per city and game day). Returns the cities inspected. A database without the 0032 tables (or the faith tables) does nothing. */
export async function runKorundRaids(db: GameDatabase, now: number): Promise<string[]> {
  const day = undergroundGameDay(now);
  let cities: string[];
  try {
    cities = (await db.prepare(`SELECT DISTINCT COALESCE(l.home_city_id,?) AS city_id FROM ${holderFrom} WHERE ${holderWhere} AND ${recentWorship}`)
      .bind(korundCapital(), now - cfg.holderLookbackSeconds).all<{ city_id: string }>()).results.map(r => String(r.city_id));
  } catch (error) { if (isMissingRelation(error)) return []; throw error; }
  const raided: string[] = [];
  for (const cityId of cities.sort()) {
    if (!raidDue(cityId, day)) continue;
    const id = raidId(cityId, day);
    try {
      const results = await db.batch([
        db.prepare(`INSERT INTO korund_raids (id,city_id,game_day,raided_at)
          SELECT ?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM korund_raids WHERE city_id=? AND raided_at>?) ON CONFLICT DO NOTHING`)
          .bind(id, cityId, day, now, cityId, now - cfg.raidMinGapSeconds),
        db.prepare(`INSERT INTO korund_raid_hits (raid_id,user_id,game_day,raided_at,devotion_hit)
          SELECT ?,f.user_id,?,?,? FROM ${holderFrom} WHERE ${holderWhere} AND COALESCE(l.home_city_id,?)=? AND ${recentWorship}
            AND EXISTS (SELECT 1 FROM korund_raids r WHERE r.id=? AND r.raided_at=?) ON CONFLICT DO NOTHING`)
          .bind(id, day, now, cfg.devotionHit, korundCapital(), cityId, now - cfg.holderLookbackSeconds, id, now),
      ]);
      if (results[0].meta.changes === 1) raided.push(cityId);
    } catch (error) { if (!isMissingRelation(error)) throw error; return raided; }
  }
  return raided;
}

/** The citizen's own Devotion hits since `since`, as dated negative events for the Devotion derivation. Absent table: none. */
export async function undergroundHits(db: GameDatabase, userId: string, since: number): Promise<{ day: number; amount: number }[]> {
  try {
    return (await db.prepare('SELECT game_day,devotion_hit FROM korund_raid_hits WHERE user_id=? AND raided_at>=? ORDER BY raided_at').bind(userId, since).all<{ game_day: number; devotion_hit: number }>())
      .results.map(r => ({ day: Number(r.game_day), amount: -Number(r.devotion_hit) }));
  } catch (error) { if (isMissingRelation(error)) return []; throw error; }
}

/** Appeal wording is the server's: the Content copy in lib/korund-suspicion-copy.ts says appeals are decided "by staff", but docs 8.18 and ARC rule an automatic decision, so these lines say that.
 *  [Placeholder wording; Content to review on the PR.] */
const appealLines = {
  explainer: 'Correction Duty can be appealed once. The result is decided automatically.',
  granted: 'Your appeal was decided automatically. Correction Duty is lifted.',
  denied: 'Your appeal was decided automatically. Correction Duty stands.',
} as const;

/** Private to the holder (#382). `repeat`: the holder was also found within the 30-day repeat window before this inspection (the repeat notice).
 *  `suspicion`: the private indicator, a label and a band word only (never the number); null while Suspicion is 0.
 *  `duty` (PR B): the current Correction Duty, or the automatic appeal result that just lifted one; null otherwise. Days left is a string with its unit, never a timestamp. */
export type DutyView = { active: boolean; label: string; banner: string | null; daysLeft: string | null; lines: string[]; appeal: { available: boolean; explainer: string; status: 'granted' | 'denied' | null; statusLine: string | null } };
export type UndergroundView = { lastRaid: { at: number; text: string; devotionNote: string; repeat: boolean } | null; quietWeek: string | null; suspicion: { line: string; privateTag: string; tooltip: string[] } | null; duty: DutyView | null };

type Appeal = { granted: boolean; appealedAt: number };
/** The holder's stored discovery times and appeals, and the Correction Duties derived from them (#382). Everything is derived on read; only appeals are stored (migration 0056). */
async function loadDuties(db: GameDatabase, userId: string) {
  const times = (await db.prepare('SELECT raided_at FROM korund_raid_hits WHERE user_id=? ORDER BY raided_at').bind(userId).all<{ raided_at: number }>()).results.map(r => Number(r.raided_at));
  const appeals = new Map<number, Appeal>();
  try {
    for (const r of (await db.prepare('SELECT duty_started_at,appealed_at,granted FROM korund_duty_appeals WHERE user_id=?').bind(userId).all<{ duty_started_at: number; appealed_at: number; granted: number }>()).results)
      appeals.set(Number(r.duty_started_at), { granted: Number(r.granted) === 1, appealedAt: Number(r.appealed_at) });
  } catch (error) { if (!isMissingRelation(error)) throw error; } // a database without 0056 has no appeals
  return { times, appeals, duties: deriveDuties(times) };
}
const lifted = (appeal: Appeal | undefined) => appeal?.granted === true;
function dutyView(duties: { startAt: number; endsAt: number }[], appeals: Map<number, Appeal>, now: number): DutyView | null {
  const latest = duties[duties.length - 1];
  if (!latest) return null;
  const appeal = appeals.get(latest.startAt), status = appeal ? (appeal.granted ? 'granted' as const : 'denied' as const) : null;
  const appealView = { available: !appeal, explainer: appealLines.explainer, status, statusLine: status ? appealLines[status] : null };
  if (latest.endsAt > now && !lifted(appeal)) return { active: true, label: correctionDuty.label, banner: correctionDuty.banner.text, daysLeft: correctionDuty.daysLeft.replace('{days}', String(Math.max(1, Math.ceil((latest.endsAt - now) / 86400)))), lines: [correctionDuty.cap.text, correctionDuty.playable.text], appeal: appealView };
  if (appeal && lifted(appeal) && now - appeal.appealedAt < cfg.recentSeconds) return { active: false, label: correctionDuty.label, banner: null, daysLeft: null, lines: [dutyEnded.system.text], appeal: appealView };
  return null;
}
/** Devotion (social standing) is the only effect of a Correction Duty: 1 point per duty day, taken at its start, none if an appeal lifted it. Dated negative events for the Devotion derivation. */
export async function dutyDevotionEvents(db: GameDatabase, userId: string): Promise<{ day: number; amount: number }[]> {
  try {
    const { duties, appeals } = await loadDuties(db, userId);
    return duties.filter(d => !lifted(appeals.get(d.startAt))).map(d => ({ day: undergroundGameDay(d.startAt), amount: -dutyDays(d) * cfg.dutyDevotionPerDay }));
  } catch (error) { if (isMissingRelation(error)) return []; throw error; }
}

/** #749: the private Suspicion indicator for the Korund panel: discoveries plus this citizen's completed gray-market trades (either side). Read-only; null at 0. */
export async function readGraySuspicion(db: GameDatabase, userId: string, now: number): Promise<UndergroundView['suspicion']> {
  let times: number[] = [];
  try { times = (await db.prepare('SELECT raided_at FROM korund_raid_hits WHERE user_id=? ORDER BY raided_at').bind(userId).all<{ raided_at: number }>()).results.map(r => Number(r.raided_at)); }
  catch (error) { if (!isMissingRelation(error)) throw error; }
  const trades = (await db.prepare('SELECT traded_at FROM gray_trades WHERE seller_id=? OR buyer_id=?').bind(userId, userId).all<{ traded_at: number }>()).results.map(r => Number(r.traded_at));
  const band = suspicionBand(suspicionLevelWithGray(times, trades, now));
  return band === 'none' ? null : { line: suspicionIndicator.levelLine.replace('{level}', suspicionWord[band]), privateTag: suspicionIndicator.privateTag, tooltip: suspicionIndicator.tooltip.map(t => t.text) };
}

/** What a hidden-faith holder sees (private, derived on read). A recent inspection of them shows the first or repeat "found a shrine" notice and the Devotion note;
 *  otherwise a quiet-week line when their city has had no inspection this week. Plus the private Suspicion band and any Correction Duty. */
export async function readUndergroundView(db: GameDatabase, userId: string, cityId: string, since: number, now: number): Promise<UndergroundView> {
  const recentFrom = now - cfg.recentSeconds, none = { lastRaid: null, quietWeek: null, suspicion: null, duty: null };
  try {
    // #382: every stored discovery of this citizen, whatever faith they chose at the time (re-choosing a faith resets nothing). Suspicion, the repeat flag and duties are derived from these on read.
    const { times, appeals, duties } = await loadDuties(db, userId);
    const level = suspicionLevel(times, now), band = suspicionBand(level), duty = dutyView(duties, appeals, now);
    const suspicion = band === 'none' ? null : { line: suspicionIndicator.levelLine.replace('{level}', suspicionWord[band]), privateTag: suspicionIndicator.privateTag, tooltip: suspicionIndicator.tooltip.map(t => t.text) };
    let index = -1; times.forEach((at, i) => { if (at >= since && at >= recentFrom) index = i; });
    if (index >= 0) {
      // docs 14.6: a first discovery adds Suspicion only; a repeat (also found within the last 30 real days) is the one that starts Correction Duty.
      const repeat = isRepeatDiscovery(index > 0 ? times[index - 1] : null, times[index]);
      return { lastRaid: { at: times[index], text: copy.discovery[repeat ? 'repeat' : 'first'].text, devotionNote: copy.raidResult.devotionNote.text, repeat }, quietWeek: null, suspicion, duty };
    }
    const cityRaid = await db.prepare('SELECT id FROM korund_raids WHERE city_id=? AND raided_at>=? LIMIT 1').bind(cityId, recentFrom).first<{ id: string }>();
    if (cityRaid) return { ...none, suspicion, duty };
    const line = copy.quietWeek[pickIndex(`${userId}:${undergroundGameDay(now)}`, copy.quietWeek.length)];
    return { lastRaid: null, quietWeek: fillCity(line.text, cityId), suspicion, duty };
  } catch (error) { if (!isMissingRelation(error)) throw error; return none; }
}

/** The holder's one automatic appeal of their current Correction Duty (docs 8.18: automatic rule, decided at once). Idempotent per request id; refuses with no active duty or a second appeal for the same duty. */
export async function appealCorrectionDuty(db: GameDatabase, userId: string, requestId: string, now: number):
  Promise<{ ok: true; granted: boolean; text: string; replay: boolean } | { ok: false; status: 409; reason: string; error: string }> {
  const prior = await db.prepare('SELECT user_id,granted FROM korund_duty_appeals WHERE request_id=?').bind(requestId).first<{ user_id: string; granted: number }>();
  if (prior) return prior.user_id === userId ? { ok: true, granted: Number(prior.granted) === 1, text: appealLines[Number(prior.granted) === 1 ? 'granted' : 'denied'], replay: true } : { ok: false, status: 409, reason: 'request_reused', error: 'That request id was already used.' };
  const { times, appeals, duties } = await loadDuties(db, userId);
  const duty = duties[duties.length - 1];
  if (!duty || duty.endsAt <= now || lifted(appeals.get(duty.startAt))) return { ok: false, status: 409, reason: 'no_duty', error: 'You are not on Correction Duty.' };
  if (appeals.has(duty.startAt)) return { ok: false, status: 409, reason: 'already_appealed', error: 'You have already appealed this Correction Duty.' };
  const granted = appealGranted(times, duty.startAt);
  await db.batch([db.prepare('INSERT INTO korund_duty_appeals (user_id,duty_started_at,appealed_at,granted,request_id) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING').bind(userId, duty.startAt, now, granted ? 1 : 0, requestId)]);
  const saved = await db.prepare('SELECT user_id FROM korund_duty_appeals WHERE request_id=?').bind(requestId).first<{ user_id: string }>();
  if (!saved) return { ok: false, status: 409, reason: 'already_appealed', error: 'You have already appealed this Correction Duty.' };
  return { ok: true, granted, text: appealLines[granted ? 'granted' : 'denied'], replay: false };
}

/** The citizen's city for raids: their home city, or the Korund capital when no location row exists. */
export async function holderCity(db: GameDatabase, userId: string): Promise<string> {
  try {
    const row = await db.prepare("SELECT home_city_id FROM citizen_city_locations WHERE user_id=? AND nation_id='korund'").bind(userId).first<{ home_city_id: string }>();
    if (row?.home_city_id) return String(row.home_city_id);
  } catch (error) { if (!isMissingRelation(error)) throw error; }
  return korundCapital();
}

/** Korund State Media rumors for the national news (derived on read, never published as events). Names {city} only: no faith, shrine, person or count. */
export async function undergroundNewsItems(db: GameDatabase, now: number) {
  let rows: { id: string; city_id: string; raided_at: number }[];
  try { rows = (await db.prepare('SELECT id,city_id,raided_at FROM korund_raids WHERE raided_at>=? ORDER BY raided_at DESC LIMIT ?').bind(now - cfg.newsWindowSeconds, cfg.newsLimit).all<{ id: string; city_id: string; raided_at: number }>()).results; }
  catch (error) { if (isMissingRelation(error)) return []; throw error; }
  return rows.map(r => ({
    id: `korund:inspection:${r.id}`, title: 'Inspection concluded',
    text: fillCity(copy.stateMediaRumors[pickIndex(r.id, copy.stateMediaRumors.length)].text, String(r.city_id)),
    occurredAt: Number(r.raided_at) * 1000, source: 'deterministic' as const, kind: 'template' as const,
  }));
}
