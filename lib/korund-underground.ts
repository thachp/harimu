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
import { suspicionIndicator } from './korund-suspicion-copy';
import { isRepeatDiscovery, suspicionBand, suspicionLevel, suspicionWord, pickIndex, raidDue, raidId, undergroundConfig as cfg, undergroundGameDay } from './underground-rules';

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

/** Private to the holder (#382). `repeat`: the holder was also found within the 30-day repeat window before this inspection (the repeat notice). `discoveries`: how many inspections found them since they chose this faith.
 *  `suspicion`: the private indicator, a label and a band word only (never the number); null while Suspicion is 0. */
export type UndergroundView = { lastRaid: { at: number; text: string; devotionNote: string; repeat: boolean; discoveries: number } | null; quietWeek: string | null; suspicion: { line: string; privateTag: string; tooltip: string[] } | null };
/** What a hidden-faith holder sees (private, derived on read). A recent inspection of them shows the existing "found a shrine" notice and the Devotion note;
 *  otherwise a quiet-week line when their city has had no inspection this week. */
export async function readUndergroundView(db: GameDatabase, userId: string, cityId: string, since: number, now: number): Promise<UndergroundView> {
  const recentFrom = now - cfg.recentSeconds, none = { lastRaid: null, quietWeek: null, suspicion: null };
  try {
    // #382: every stored discovery of this citizen, whatever faith they chose at the time (re-choosing a faith resets nothing). Suspicion and the repeat flag are derived from these on read.
    const times = (await db.prepare('SELECT raided_at FROM korund_raid_hits WHERE user_id=? ORDER BY raided_at').bind(userId).all<{ raided_at: number }>()).results.map(r => Number(r.raided_at));
    const level = suspicionLevel(times, now), band = suspicionBand(level);
    const suspicion = band === 'none' ? null : { line: suspicionIndicator.levelLine.replace('{level}', suspicionWord[band]), privateTag: suspicionIndicator.privateTag, tooltip: suspicionIndicator.tooltip.map(t => t.text) };
    let index = -1; times.forEach((at, i) => { if (at >= since && at >= recentFrom) index = i; });
    if (index >= 0) {
      // docs 14.6: a first discovery adds Suspicion only; a repeat (also found within the last 30 real days) is the one that may lead to Correction Duty.
      const repeat = isRepeatDiscovery(index > 0 ? times[index - 1] : null, times[index]);
      return { lastRaid: { at: times[index], text: copy.discovery[repeat ? 'repeat' : 'first'].text, devotionNote: copy.raidResult.devotionNote.text, repeat, discoveries: index + 1 }, quietWeek: null, suspicion };
    }
    const cityRaid = await db.prepare('SELECT id FROM korund_raids WHERE city_id=? AND raided_at>=? LIMIT 1').bind(cityId, recentFrom).first<{ id: string }>();
    if (cityRaid) return { ...none, suspicion };
    const line = copy.quietWeek[pickIndex(`${userId}:${undergroundGameDay(now)}`, copy.quietWeek.length)];
    return { lastRaid: null, quietWeek: fillCity(line.text, cityId), suspicion };
  } catch (error) { if (!isMissingRelation(error)) throw error; return none; }
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
