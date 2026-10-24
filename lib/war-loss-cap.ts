/** #912: war hard cap. Canon: harimu-docs 15.3 "Hard caps" (https://docs.harimu.com/diplomacy-war/territory-cities-warfare/): "A nation can lose at most 10% of its
 *  frontier squares per real week [ASSUMPTION]; Heartland is immune." Behind HARIMU_WAR_LOSS_CAP_ENABLED ("true" in preview, "false" in production). Flag off: the
 *  siege capture path is byte-identical and nothing here is read. The only war path that moves a square on dev is the siege capture (lib/siege-actions); treaty
 *  cessions (lib/war-endings) are ratified transfers, not war capture, and stay out of scope. Refused captures are written to war_capture_refusals (migration 0094). */
import type { GameDatabase } from './database-contract';

/** ARC on #921: the docs' "real week" is a rolling 168 hours back from now, not a calendar week. A loss at now − 7d + 1s counts; one at exactly now − 7d does not. */
export const WAR_LOSS_WINDOW_MS = 168 * 60 * 60 * 1000;
export const warLossCap = {
  weeklyFrontierLossBp: 1000,   // docs 15.3 [ASSUMPTION]: at most 10% of a nation's frontier squares per real week (basis points)
  windowSeconds: WAR_LOSS_WINDOW_MS / 1000, // docs 15.3: "per real week" = rolling 168 hours (ARC on #921)
  minimumSquares: 1,            // issue #912: round down, minimum 1, so a small nation can still lose one square a week
} as const;
export const warLossCapEnabled = (env: { HARIMU_WAR_LOSS_CAP_ENABLED?: string } | null | undefined) => env?.HARIMU_WAR_LOSS_CAP_ENABLED === 'true';

/** The most frontier squares a nation may lose in one window, from what it held when the window opened. */
export const weeklyLossLimit = (heldAtWindowStart: number) =>
  Math.max(warLossCap.minimumSquares, Math.floor(Math.max(0, heldAtWindowStart) * warLossCap.weeklyFrontierLossBp / 10000));

export type CapSquare = { x: number; y: number; zone: string; from: string; to: string };
export type CapDecision = { ok: true; transfer: CapSquare[]; heartland: CapSquare[] }
  | { ok: false; reason: 'weekly_cap'; transfer: CapSquare[]; heartland: CapSquare[]; lost: number; limit: number };
/** Pure. Heartland squares never move (they are dropped and reported); the rest move only if the defender's frontier losses in the window, plus this capture,
 *  stay within the limit. A capture is all or nothing: over the limit, nothing moves and the city stays contested. */
export function decideCapture(squares: readonly CapSquare[], lostInWindow: number, heldAtWindowStart: number): CapDecision {
  const heartland = squares.filter(s => s.zone === 'heartland'), transfer = squares.filter(s => s.zone !== 'heartland');
  const frontier = transfer.filter(s => s.zone === 'frontier').length, limit = weeklyLossLimit(heldAtWindowStart);
  if (frontier > 0 && lostInWindow + frontier > limit) return { ok: false, reason: 'weekly_cap', transfer, heartland, lost: lostInWindow, limit };
  return { ok: true, transfer, heartland };
}

const movedSql = (side: 'from_nation' | 'to_nation') => `SELECT COUNT(*) AS n FROM city_capture_squares q JOIN city_captures c ON c.id=q.capture_id
 JOIN world_squares w ON w.x=q.x AND w.y=q.y WHERE q.${side}=? AND w.zone='frontier' AND c.captured_at>?`;
/** The defender's frontier losses in the trailing window and what it held when the window opened (held now + lost − gained since). */
export async function frontierLedger(db: GameDatabase, nation: string, now: number) {
  const since = now - warLossCap.windowSeconds;
  const held = Number((await db.prepare("SELECT COUNT(*) AS n FROM world_squares WHERE owner=? AND zone='frontier'").bind(nation).first<{ n: number }>())?.n ?? 0);
  const lost = Number((await db.prepare(movedSql('from_nation')).bind(nation, since).first<{ n: number }>())?.n ?? 0);
  const gained = Number((await db.prepare(movedSql('to_nation')).bind(nation, since).first<{ n: number }>())?.n ?? 0);
  return { lost, heldAtWindowStart: Math.max(0, held + lost - gained) };
}

/** #912 (ARC on #921): lock the defender's nations row first in the capture batch (Postgres: a row lock held to commit, the #914 pool-lock pattern;
 *  SQLite/D1: the batch is one write transaction already), so two captures of the same defender serialize and the guard below sees the first one's losses. */
export const defenderLockSql = 'UPDATE nations SET id=id WHERE id=?';
const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;
/** SQL condition, re-checked inside the batch after the lock: this capture's `frontier` squares fit under the defender's weekly limit. Literals only (nation ids are
 *  validated server constants, numbers are integers), so no binds shift. */
export function capGuardSql(defender: string, frontier: number, now: number) {
  if (!(frontier > 0)) return '1=1';
  const since = Math.floor(now) - warLossCap.windowSeconds, d = lit(defender);
  const moved = (side: string) => `(SELECT COUNT(*) FROM city_capture_squares q JOIN city_captures c ON c.id=q.capture_id JOIN world_squares w ON w.x=q.x AND w.y=q.y WHERE q.${side}=${d} AND w.zone='frontier' AND c.captured_at>${since})`;
  const start = `((SELECT COUNT(*) FROM world_squares WHERE owner=${d} AND zone='frontier')+${moved('from_nation')}-${moved('to_nation')})*${warLossCap.weeklyFrontierLossBp}/10000`;
  return `${moved('from_nation')}+${Math.floor(frontier)}<=CASE WHEN ${start}<${warLossCap.minimumSquares} THEN ${warLossCap.minimumSquares} ELSE ${start} END`;
}

export const warCaptureRefusalSchemas = [
  `CREATE TABLE IF NOT EXISTS war_capture_refusals (
 id TEXT PRIMARY KEY,
 siege_id TEXT NOT NULL REFERENCES city_sieges(id) ON DELETE CASCADE,
 war_id TEXT NOT NULL REFERENCES wars(id) ON DELETE CASCADE,
 attacker_nation TEXT NOT NULL,
 defender_nation TEXT NOT NULL,
 reason TEXT NOT NULL CHECK(reason IN ('weekly_cap','heartland')),
 squares INTEGER NOT NULL CHECK(squares >= 1),
 lost_in_window INTEGER NOT NULL CHECK(lost_in_window >= 0),
 weekly_limit INTEGER NOT NULL CHECK(weekly_limit >= 1),
 refused_at INTEGER NOT NULL
)`,
  'CREATE INDEX IF NOT EXISTS idx_war_capture_refusals_war ON war_capture_refusals(war_id, refused_at)',
];
/** Write one war-log row for a refused capture (the visible reason a square did not flip). */
export const refusalStatement = (db: GameDatabase, row: { siegeId: string; warId: string; attacker: string; defender: string; reason: 'weekly_cap' | 'heartland'; squares: number; lost: number; limit: number; now: number }) =>
  db.prepare('INSERT INTO war_capture_refusals (id,siege_id,war_id,attacker_nation,defender_nation,reason,squares,lost_in_window,weekly_limit,refused_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(`wcr-${crypto.randomUUID()}`, row.siegeId, row.warId, row.attacker, row.defender, row.reason, row.squares, row.lost, row.limit, row.now);
/** Read-only war log of refused captures, newest first. */
export async function readCaptureRefusals(db: GameDatabase, warId: string) {
  return (await db.prepare('SELECT reason,squares,lost_in_window,weekly_limit,defender_nation,refused_at FROM war_capture_refusals WHERE war_id=? ORDER BY refused_at DESC,id LIMIT 50').bind(warId).all<{ reason: string; squares: number; lost_in_window: number; weekly_limit: number; defender_nation: string; refused_at: number }>()).results;
}
