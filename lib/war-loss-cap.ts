/** #912: war hard cap. Canon: harimu-docs 15.3 "Hard caps" (https://docs.harimu.com/diplomacy-war/territory-cities-warfare/): "A nation can lose at most 10% of its
 *  frontier squares per real week [ASSUMPTION]; Heartland is immune." Behind HARIMU_WAR_LOSS_CAP_ENABLED ("true" in preview, "false" in production). Flag off: the
 *  siege capture path is byte-identical and nothing here is read. The only war path that moves a square on dev is the siege capture (lib/siege-actions); treaty
 *  cessions (lib/war-endings) are ratified transfers, not war capture, and stay out of scope. Refused captures are written to war_capture_refusals (migration 0094). */
import type { GameDatabase } from './database-contract';

export const warLossCap = {
  weeklyFrontierLossBp: 1000,   // docs 15.3 [ASSUMPTION]: at most 10% of a nation's frontier squares per real week (basis points)
  windowSeconds: 7 * 86400,     // docs 15.3: "per real week", a trailing seven real days
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
