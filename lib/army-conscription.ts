/** #738 slice 3: conscription (docs §11.3 Military: conscription lottery in Korund, levies in Aurelle; §15.4 newcomer shield). Behind the
 *  existing HARIMU_ARMIES_ENABLED + HARIMU_WAR_ENABLED (ARC). Migration 0080 mirrors conscriptionSchemas. Volunteering stays Kindle-only. */
import type { GameDatabase } from './database-contract';
import { unitForNation, defaultStance } from './army-rules';

const DAY = 86400;
/** [ASSUMPTION] One draft per nation per game week (7 game days = 50400 s, the spark-supply game week). */
export const DRAFT_WEEK_SECONDS = 50400;
/** Docs §15.4: new citizens cannot be conscripted for 14 real days. Dormant citizens (30 days, lib/dormancy-rules) are skipped. */
export const NEWCOMER_SHIELD_SECONDS = 14 * DAY;
export const DORMANT_SECONDS = 30 * DAY;
/** [ASSUMPTION] A conscript serves 2 game weeks and cannot leave the unit before then. */
export const SERVICE_TERM_SECONDS = 2 * DRAFT_WEEK_SECONDS;
/** [ASSUMPTION] Korund's lottery draws 1 in 10 eligible citizens (at least 1). Aurelle's levy takes one citizen per home city. */
export const LOTTERY_SHARE = 0.1;
export const conscriptionNations = ['korund', 'aurelle'] as const;
export type Eligible = { id: string; city: string | null };

export const conscriptionSchemas = [
  `CREATE TABLE IF NOT EXISTS army_drafts (nation_id TEXT NOT NULL, game_week INTEGER NOT NULL, token TEXT NOT NULL, drafted INTEGER NOT NULL CHECK(drafted >= 0), ran_at INTEGER NOT NULL, PRIMARY KEY (nation_id, game_week))`,
  `CREATE TABLE IF NOT EXISTS army_conscripts (clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE, nation_id TEXT NOT NULL, game_week INTEGER NOT NULL, serve_until INTEGER NOT NULL, stayed_at INTEGER, PRIMARY KEY (clerk_user_id, game_week))`,
];
/** ARC on #839 (migration 0082): stayed_at marks a conscript who chose to stay after the term; they are not released. */
export const conscriptStayColumn = 'ALTER TABLE army_conscripts ADD COLUMN stayed_at INTEGER';
/** Stable 32-bit FNV-1a: the same week and roster always draw the same citizens, so a replayed or concurrent draft agrees. */
const rank = (seed: string) => { let h = 0x811c9dc5; for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193) >>> 0; return h; };
export function pickConscripts(nation: string, week: number, eligible: readonly Eligible[]): string[] {
  const order = [...eligible].sort((a, b) => rank(`${nation}:${week}:${a.id}`) - rank(`${nation}:${week}:${b.id}`) || (a.id < b.id ? -1 : 1));
  if (nation === 'korund') return order.slice(0, eligible.length ? Math.max(1, Math.floor(eligible.length * LOTTERY_SHARE)) : 0).map(e => e.id);
  if (nation === 'aurelle') { const seen = new Set<string>(); return order.filter(e => { const c = e.city ?? ''; if (seen.has(c)) return false; seen.add(c); return true; }).map(e => e.id); }
  return [];
}
/** Runs this game week's draft for a conscription nation once. The first insert of the draft row wins; every member and conscript insert is
 *  guarded by the winner's token, so a concurrent or replayed draft writes nothing. Returns the number drafted, or null on a replay. */
export async function runDraft(db: GameDatabase, nationId: string, nowSec: number): Promise<number | null> {
  const unit = unitForNation(nationId);
  if (!unit || !(conscriptionNations as readonly string[]).includes(nationId)) return null;
  const week = Math.floor(nowSec / DRAFT_WEEK_SECONDS);
  if (await db.prepare('SELECT 1 AS x FROM army_drafts WHERE nation_id = ? AND game_week = ?').bind(nationId, week).first()) return null;
  const iso = (s: number) => new Date(s * 1000).toISOString();
  const rows = await db.prepare(`SELECT c.clerk_user_id AS id, l.home_city_id AS city FROM citizens c
      LEFT JOIN citizen_city_locations l ON l.user_id = c.clerk_user_id AND l.nation_id = c.nation_id
      LEFT JOIN army_members m ON m.clerk_user_id = c.clerk_user_id
    WHERE c.nation_id = ? AND m.clerk_user_id IS NULL AND c.created_at <= ? AND COALESCE(c.last_active_at, c.created_at) > ?`)
    .bind(nationId, iso(nowSec - NEWCOMER_SHIELD_SECONDS), iso(nowSec - DORMANT_SECONDS)).all<Eligible>();
  const picked = pickConscripts(nationId, week, rows.results ?? []);
  const token = crypto.randomUUID(), mine = 'EXISTS (SELECT 1 FROM army_drafts WHERE nation_id = ? AND game_week = ? AND token = ?)';
  const results = await db.batch([
    db.prepare('INSERT INTO army_drafts (nation_id, game_week, token, drafted, ran_at) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING').bind(nationId, week, token, picked.length, nowSec),
    ...picked.flatMap(id => [
      db.prepare(`INSERT INTO army_members (clerk_user_id, unit_id, stance, joined_at, request_id) SELECT ?, ?, ?, ?, ? WHERE ${mine} ON CONFLICT DO NOTHING`)
        .bind(id, unit.id, defaultStance, nowSec, `draft-${nationId}-${week}-${id}`.slice(0, 200), nationId, week, token),
      db.prepare(`INSERT INTO army_conscripts (clerk_user_id, nation_id, game_week, serve_until) SELECT ?, ?, ?, ? WHERE ${mine} ON CONFLICT DO NOTHING`)
        .bind(id, nationId, week, nowSec + SERVICE_TERM_SECONDS, nationId, week, token),
    ]),
  ]);
  return Number(results[0]?.meta?.changes ?? 0) === 1 ? picked.length : null;
}
/** The end of the citizen's current service term, or null when not serving. */
export async function serviceUntil(db: GameDatabase, userId: string, nowSec: number): Promise<number | null> {
  const row = await db.prepare('SELECT MAX(serve_until) AS until FROM army_conscripts WHERE clerk_user_id = ?').bind(userId).first<{ until: number | null }>();
  const until = Number(row?.until ?? 0);
  return until > nowSec ? until : null;
}
/** ARC on #839: at term end a conscript leaves the unit and is draft-eligible again, unless they chose to stay. Only the latest term counts,
 *  so an older expired term never releases a newer one (conscription nations take no volunteers). Idempotent. */
export async function releaseExpired(db: GameDatabase, nationId: string, nowSec: number) {
  const unit = unitForNation(nationId);
  if (!unit) return 0;
  const res = await db.prepare(`DELETE FROM army_members WHERE unit_id = ? AND clerk_user_id IN (
      SELECT c.clerk_user_id FROM army_conscripts c WHERE c.nation_id = ? AND c.serve_until <= ? AND c.stayed_at IS NULL
        AND c.game_week = (SELECT MAX(game_week) FROM army_conscripts x WHERE x.clerk_user_id = c.clerk_user_id))`).bind(unit.id, nationId, nowSec).run();
  return Number(res.meta?.changes ?? 0);
}
/** Marks the serving term as "stay"; true when a serving (or already staying) term exists. */
export async function stayAfterTerm(db: GameDatabase, userId: string, nowSec: number) {
  await db.prepare(`UPDATE army_conscripts SET stayed_at = ? WHERE clerk_user_id = ? AND stayed_at IS NULL AND serve_until > ?
    AND game_week = (SELECT MAX(game_week) FROM army_conscripts x WHERE x.clerk_user_id = army_conscripts.clerk_user_id)`).bind(nowSec, userId, nowSec).run();
  return !!(await db.prepare('SELECT 1 AS x FROM army_conscripts WHERE clerk_user_id = ? AND serve_until > ? AND stayed_at IS NOT NULL').bind(userId, nowSec).first());
}
