/** #867: Kindle rallies PoC behind HARIMU_KINDLE_RALLIES_ENABLED. Each AI candidate holds one scheduled rally per real week in a Kindle city square.
 *  Citizens mark "attend" once per rally (one row per citizen and rally). When the rally time passes, the scheduled Worker publishes one news clip per rally
 *  (rally_clips, PRIMARY KEY rally_id), labeled AI. The speech is the template path (the AI-labeled template line used when the AI kill switch is in templates-only
 *  mode). #876: a model-written speech stored in rally_speeches (lib/rally-speech-ai.ts) replaces the template once it exists. Rallies add NO votes or ballot weight: nothing in lib/elections.ts or lib/primaries.ts reads these tables. */
import type { GameDatabase } from './database-contract';
import { electionCandidates } from './elections';
import { citiesForNation } from './cities';
import { lastRallyWeek, parseRallyId, rallyAiCrowd, rallyIdFor, rallyStartsAt, upcomingRallyWeek } from './rallies-rules';
export * from './rallies-rules';

export const rallySchemas = [
  `CREATE TABLE IF NOT EXISTS rally_attendance (rally_id TEXT NOT NULL, clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE, attended_at INTEGER NOT NULL, PRIMARY KEY (rally_id, clerk_user_id))`,
  `CREATE TABLE IF NOT EXISTS rally_clips (rally_id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL, city_id TEXT NOT NULL, humans INTEGER NOT NULL CHECK(humans >= 0), ai_crowd INTEGER NOT NULL CHECK(ai_crowd >= 0), speech TEXT NOT NULL, published_at INTEGER NOT NULL)`,
];
export type Rally = { id: string; candidateId: string; candidateName: string; cityId: string; cityName: string; startsAt: number; speech: { text: string; ai: true }; humans: number; aiCrowd: number; crowd: number; attending: boolean };

export function rallyFor(index: number, week: number) {
  const c = electionCandidates[index], cities = citiesForNation('kindle'), city = cities[(week + index) % cities.length];
  return { id: rallyIdFor(c.id, week), candidate: c, city, startsAt: rallyStartsAt(week, index),
    speech: `${c.name} to the crowd in ${city.name}: ${c.platform} Kindle works when Kindle works together.` };
}
/** #876: the stored model-written speech for this rally, or the #867 template. */
const speechOf = async (db: GameDatabase, r: { id: string; speech: string }) => {
  try { return (await db.prepare('SELECT speech FROM rally_speeches WHERE rally_id=?').bind(r.id).first<{ speech: string }>())?.speech ?? r.speech; } catch { return r.speech; }
};
const humans = async (db: GameDatabase, rallyId: string) => Number((await db.prepare('SELECT COUNT(*) AS n FROM rally_attendance WHERE rally_id=?').bind(rallyId).first<{ n: number }>())?.n ?? 0);

/** Read-only: each candidate's upcoming rally. */
export async function readRallies(db: GameDatabase, userId: string, now: number): Promise<Rally[]> {
  const out: Rally[] = [];
  for (let i = 0; i < electionCandidates.length; i++) {
    const r = rallyFor(i, upcomingRallyWeek(now, i)), n = await humans(db, r.id);
    const mine = await db.prepare('SELECT 1 AS x FROM rally_attendance WHERE rally_id=? AND clerk_user_id=?').bind(r.id, userId).first();
    out.push({ id: r.id, candidateId: r.candidate.id, candidateName: r.candidate.name, cityId: r.city.id, cityName: r.city.name, startsAt: r.startsAt,
      speech: { text: await speechOf(db, r), ai: true }, humans: n, aiCrowd: rallyAiCrowd, crowd: n + rallyAiCrowd, attending: Boolean(mine) });
  }
  return out;
}
/** Attend only a candidate's current upcoming rally (ids come from the schedule, never the client). A repeat is a no-op. */
export async function attendRally(db: GameDatabase, userId: string, rallyId: string, now: number): Promise<{ ok: true } | { ok: false; status: number; error: string; reason: string }> {
  const p = parseRallyId(rallyId), index = p ? electionCandidates.findIndex(c => c.id === p.candidateId) : -1;
  if (!p || index < 0) return { ok: false, status: 400, error: 'Unknown rally.', reason: 'bad_request' };
  if (p.week !== upcomingRallyWeek(now, index)) return { ok: false, status: 409, error: 'That rally is not open for sign-ups.', reason: 'not_upcoming' };
  await db.prepare('INSERT INTO rally_attendance (rally_id, clerk_user_id, attended_at) VALUES (?,?,?) ON CONFLICT DO NOTHING').bind(rallyId, userId, now).run();
  return { ok: true };
}
/** Scheduled Worker: publish one clip per rally whose time has passed. Idempotent (PRIMARY KEY rally_id). */
export async function runRallyCron(db: GameDatabase, now: number) {
  let published = 0;
  for (let i = 0; i < electionCandidates.length; i++) {
    const r = rallyFor(i, lastRallyWeek(now, i));
    const res = await db.prepare('INSERT INTO rally_clips (rally_id, candidate_id, city_id, humans, ai_crowd, speech, published_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT DO NOTHING')
      .bind(r.id, r.candidate.id, r.city.id, await humans(db, r.id), rallyAiCrowd, await speechOf(db, r), now).run();
    published += Number(res.meta?.changes ?? 0);
  }
  return { status: 'ran' as const, published };
}
/** News items for the Kindle edition (derived on read from published clips). */
export async function rallyNewsItems(db: GameDatabase) {
  const rows = (await db.prepare('SELECT rally_id, candidate_id, city_id, humans, ai_crowd, speech, published_at FROM rally_clips ORDER BY published_at DESC, rally_id LIMIT 6').all<{ rally_id: string; candidate_id: string; city_id: string; humans: number; ai_crowd: number; speech: string; published_at: number }>()).results ?? [];
  return rows.map(r => {
    const name = electionCandidates.find(c => c.id === r.candidate_id)?.name ?? r.candidate_id, city = citiesForNation('kindle').find(c => c.id === r.city_id)?.name ?? r.city_id;
    return { id: `kindle:rally:${r.rally_id}`, title: `AI clip: ${name} rallies in ${city}`,
      text: `AI-generated rally clip. ${Number(r.humans)} citizens and ${Number(r.ai_crowd)} AI citizens attended. ${r.speech}`, occurredAt: Number(r.published_at) * 1000 };
  });
}
