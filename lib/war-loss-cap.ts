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
export type CapDecision = { ok: true; transfer: CapSquare[]; heartland: CapSquare[]; remaining: number; flipped: boolean }
  | { ok: false; reason: 'weekly_cap'; transfer: CapSquare[]; heartland: CapSquare[]; lost: number; limit: number };
/** #933: Chebyshev-1 neighbour of any attacker-held square. */
export const bordersAttacker = (sq: { x: number; y: number }, attackerKeys: ReadonlySet<string>) => {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && attackerKeys.has(`${sq.x + dx},${sq.y + dy}`)) return true;
  return false;
};
/** #933 ARC: bordering the attacker first, then lowest square id (y, then x). */
export function orderCaptureSquares(squares: readonly CapSquare[], attackerKeys: ReadonlySet<string>): CapSquare[] {
  return [...squares].sort((a, b) => {
    const ba = bordersAttacker(a, attackerKeys) ? 0 : 1, bb = bordersAttacker(b, attackerKeys) ? 0 : 1;
    return ba - bb || a.y - b.y || a.x - b.x;
  });
}
/** Pure. Heartland never moves. #933: take at most `remaining = limit − lost` frontier squares in fixed order; if remaining is 0, refuse. `flipped` means every non-Heartland square was taken. */
export function decideCapture(squares: readonly CapSquare[], lostInWindow: number, heldAtWindowStart: number, attackerKeys: ReadonlySet<string> = new Set()): CapDecision {
  const heartland = squares.filter(s => s.zone === 'heartland');
  const ordered = orderCaptureSquares(squares.filter(s => s.zone !== 'heartland'), attackerKeys);
  const limit = weeklyLossLimit(heldAtWindowStart), remaining = Math.max(0, limit - lostInWindow);
  if (!ordered.length) return { ok: true, transfer: [], heartland, remaining, flipped: heartland.length === squares.length || !squares.length };
  if (remaining === 0) return { ok: false, reason: 'weekly_cap', transfer: ordered, heartland, lost: lostInWindow, limit };
  const frontierSlots = remaining;
  const transfer: CapSquare[] = [];
  let used = 0;
  for (const s of ordered) {
    if (s.zone === 'frontier') { if (used >= frontierSlots) continue; used++; }
    transfer.push(s);
  }
  return { ok: true, transfer, heartland, remaining, flipped: transfer.length === ordered.length };
}

const siegeMovedSql = (side: 'from_nation' | 'to_nation') => `SELECT COUNT(*) AS n FROM city_capture_squares q JOIN city_captures c ON c.id=q.capture_id
 JOIN world_squares w ON w.x=q.x AND w.y=q.y WHERE q.${side}=? AND w.zone='frontier' AND c.captured_at>?`;
const battleMovedSql = (side: 'from_nation' | 'to_nation') => `SELECT COUNT(*) AS n FROM war_frontier_transfers WHERE ${side}=? AND transferred_at>?`;
/** The defender's frontier losses in the trailing window and what it held when the window opened (held now + lost − gained since). Siege + battle (#934). */
export async function frontierLedger(db: GameDatabase, nation: string, now: number) {
  const since = now - warLossCap.windowSeconds;
  const held = Number((await db.prepare("SELECT COUNT(*) AS n FROM world_squares WHERE owner=? AND zone='frontier'").bind(nation).first<{ n: number }>())?.n ?? 0);
  const lost = Number((await db.prepare(siegeMovedSql('from_nation')).bind(nation, since).first<{ n: number }>())?.n ?? 0)
    + Number((await db.prepare(battleMovedSql('from_nation')).bind(nation, since).first<{ n: number }>())?.n ?? 0);
  const gained = Number((await db.prepare(siegeMovedSql('to_nation')).bind(nation, since).first<{ n: number }>())?.n ?? 0)
    + Number((await db.prepare(battleMovedSql('to_nation')).bind(nation, since).first<{ n: number }>())?.n ?? 0);
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
  const moved = (side: string) => `((SELECT COUNT(*) FROM city_capture_squares q JOIN city_captures c ON c.id=q.capture_id JOIN world_squares w ON w.x=q.x AND w.y=q.y WHERE q.${side}=${d} AND w.zone='frontier' AND c.captured_at>${since})+(SELECT COUNT(*) FROM war_frontier_transfers WHERE ${side}=${d} AND transferred_at>${since}))`;
  const start = `((SELECT COUNT(*) FROM world_squares WHERE owner=${d} AND zone='frontier')+${moved('from_nation')}-${moved('to_nation')})*${warLossCap.weeklyFrontierLossBp}/10000`;
  return `${moved('from_nation')}+${Math.floor(frontier)}<=CASE WHEN ${start}<${warLossCap.minimumSquares} THEN ${warLossCap.minimumSquares} ELSE ${start} END`;
}

export const warCaptureRefusalSchemas = [
  `CREATE TABLE IF NOT EXISTS war_capture_refusals (
 id TEXT PRIMARY KEY,
 siege_id TEXT REFERENCES city_sieges(id) ON DELETE CASCADE,
 battle_key TEXT,
 war_id TEXT NOT NULL REFERENCES wars(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL CHECK(length(request_id) BETWEEN 8 AND 64),
 attacker_nation TEXT NOT NULL,
 defender_nation TEXT NOT NULL,
 reason TEXT NOT NULL CHECK(reason IN ('weekly_cap','heartland')),
 squares INTEGER NOT NULL CHECK(squares >= 1),
 lost_in_window INTEGER NOT NULL CHECK(lost_in_window >= 0),
 weekly_limit INTEGER NOT NULL CHECK(weekly_limit >= 1),
 refused_at INTEGER NOT NULL,
 CHECK((siege_id IS NOT NULL AND battle_key IS NULL) OR (siege_id IS NULL AND battle_key IS NOT NULL))
)`,
  // #921 QA1: one refusal per attempt key; a retry of the same request must not add another row.
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_war_capture_refusals_siege ON war_capture_refusals(siege_id, request_id, reason) WHERE siege_id IS NOT NULL',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_war_capture_refusals_battle ON war_capture_refusals(battle_key, request_id, reason) WHERE battle_key IS NOT NULL',
  'CREATE INDEX IF NOT EXISTS idx_war_capture_refusals_war ON war_capture_refusals(war_id, refused_at)',
  // #934: battle (and any non-siege) frontier losses the weekly ledger counts alongside city_capture_squares.
  `CREATE TABLE IF NOT EXISTS war_frontier_transfers (
 id TEXT PRIMARY KEY,
 war_id TEXT NOT NULL REFERENCES wars(id) ON DELETE CASCADE,
 battle_key TEXT NOT NULL,
 request_id TEXT NOT NULL,
 x INTEGER NOT NULL, y INTEGER NOT NULL,
 from_nation TEXT NOT NULL, to_nation TEXT NOT NULL,
 transferred_at INTEGER NOT NULL
)`,
  'CREATE INDEX IF NOT EXISTS idx_war_frontier_transfers_from ON war_frontier_transfers(from_nation, transferred_at)',
];
export type RefusalSource = { siegeId: string; battleKey?: undefined } | { battleKey: string; siegeId?: undefined };
/** Write one war-log row for a refused capture. Idempotent per (source, request, reason). */
export const refusalStatement = (db: GameDatabase, row: RefusalSource & { warId: string; requestId: string; attacker: string; defender: string; reason: 'weekly_cap' | 'heartland'; squares: number; lost: number; limit: number; now: number }) =>
  db.prepare('INSERT OR IGNORE INTO war_capture_refusals (id,siege_id,battle_key,war_id,request_id,attacker_nation,defender_nation,reason,squares,lost_in_window,weekly_limit,refused_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(`wcr-${crypto.randomUUID()}`, row.siegeId ?? null, row.battleKey ?? null, row.warId, row.requestId, row.attacker, row.defender, row.reason, row.squares, row.lost, row.limit, row.now);
/** Read-only war log of refused captures, newest first. */
export async function readCaptureRefusals(db: GameDatabase, warId: string) {
  return (await db.prepare('SELECT reason,squares,lost_in_window,weekly_limit,defender_nation,refused_at FROM war_capture_refusals WHERE war_id=? ORDER BY refused_at DESC,id LIMIT 50').bind(warId).all<{ reason: string; squares: number; lost_in_window: number; weekly_limit: number; defender_nation: string; refused_at: number }>()).results;
}

/** #934: the shared war square-transfer guard (defender-row lock, Heartland drop, weekly cap re-check, refusal log). #910 battles do not capture; call this when a battle path gains square transfers. */
export async function transferBattleSquares(db: GameDatabase, cmd: {
  warId: string; battleKey: string; requestId: string; attacker: string; defender: string; now: number;
  squares: readonly { x: number; y: number }[];
}): Promise<{ ok: true; moved: number } | { ok: false; reason: 'weekly_loss_cap' | 'nothing'; lost?: number; limit?: number }> {
  if (!cmd.squares.length) return { ok: false, reason: 'nothing' };
  const owned: CapSquare[] = [];
  for (const sq of cmd.squares) {
    const row = await db.prepare('SELECT zone,owner FROM world_squares WHERE x=? AND y=?').bind(sq.x, sq.y).first<{ zone: string; owner: string | null }>();
    if (row?.owner === cmd.defender) owned.push({ x: sq.x, y: sq.y, zone: row.zone, from: cmd.defender, to: cmd.attacker });
  }
  const ledger = await frontierLedger(db, cmd.defender, cmd.now);
  const decision = decideCapture(owned, ledger.lost, ledger.heldAtWindowStart);
  const log = { battleKey: cmd.battleKey, warId: cmd.warId, requestId: cmd.requestId, attacker: cmd.attacker, defender: cmd.defender, lost: ledger.lost, now: cmd.now } as const;
  if (!decision.ok) { await refusalStatement(db, { ...log, reason: 'weekly_cap', squares: decision.transfer.length, limit: decision.limit }).run(); return { ok: false, reason: 'weekly_loss_cap', lost: decision.lost, limit: decision.limit }; }
  if (decision.heartland.length) await refusalStatement(db, { ...log, reason: 'heartland', squares: decision.heartland.length, limit: 1 }).run();
  const frontier = decision.transfer.filter(t => t.zone === 'frontier');
  if (!frontier.length) return { ok: false, reason: 'nothing' };
  const guard = capGuardSql(cmd.defender, frontier.length, cmd.now), gate = `wft-${crypto.randomUUID()}`;
  await db.batch([
    db.prepare(defenderLockSql).bind(cmd.defender),
    db.prepare(`INSERT INTO war_frontier_transfers (id,war_id,battle_key,request_id,x,y,from_nation,to_nation,transferred_at) SELECT ?,?,?,?,?,?,?,?,? WHERE ${guard}`)
      .bind(gate, cmd.warId, cmd.battleKey, cmd.requestId, frontier[0].x, frontier[0].y, cmd.defender, cmd.attacker, cmd.now),
    ...frontier.slice(1).map(t => db.prepare(`INSERT INTO war_frontier_transfers (id,war_id,battle_key,request_id,x,y,from_nation,to_nation,transferred_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM war_frontier_transfers WHERE id=?)`)
      .bind(`wft-${crypto.randomUUID()}`, cmd.warId, cmd.battleKey, cmd.requestId, t.x, t.y, cmd.defender, cmd.attacker, cmd.now, gate)),
    ...frontier.map(t => db.prepare(`UPDATE world_squares SET owner=? WHERE x=? AND y=? AND owner=? AND zone='frontier' AND EXISTS (SELECT 1 FROM war_frontier_transfers WHERE id=?)`)
      .bind(cmd.attacker, t.x, t.y, cmd.defender, gate)),
  ]);
  if (!(await db.prepare('SELECT 1 AS found FROM war_frontier_transfers WHERE id=?').bind(gate).first())) {
    const after = await frontierLedger(db, cmd.defender, cmd.now), limit = weeklyLossLimit(after.heldAtWindowStart);
    await refusalStatement(db, { ...log, lost: after.lost, reason: 'weekly_cap', squares: frontier.length, limit }).run();
    return { ok: false, reason: 'weekly_loss_cap', lost: after.lost, limit };
  }
  return { ok: true, moved: frontier.length };
}
