/** #1053: quartermaster shifts extend a unit's supply range (docs §15.3 Logistics: "Units need supply lines from depots... Quartermasters,
 *  drivers and sailors are player jobs"). A unit member runs at most one shift per game day (the drill pattern); each shift in the last game day
 *  adds a square to the unit's supply range, capped. Behind HARIMU_ARMY_QUARTERMASTER_ENABLED (needs HARIMU_ARMY_SUPPLY_ENABLED). Integer math only. */
import type { GameDatabase } from './database-contract';
import { flagOn } from './flag-pack.mjs';
import { armySupplyEnabled } from './army-supply';
import { ARMY_GAME_DAY_SECONDS, armyUnits } from './army-rules';

export const armyQuartermasterEnabled = (env: unknown) => armySupplyEnabled(env) && flagOn(env, 'HARIMU_ARMY_QUARTERMASTER_ENABLED');
/** [ASSUMPTION] Tuning values (the docs give none): +1 square per shift in the last game day, at most +3. */
export const QUARTERMASTER_SQUARES_PER_SHIFT = 1;
export const QUARTERMASTER_MAX_EXTRA_SQUARES = 3;
/** Extra supply squares from `shifts` shifts in the window. */
export const quartermasterExtra = (shifts: number) => Math.min(QUARTERMASTER_MAX_EXTRA_SQUARES, Math.max(0, Math.floor(shifts)) * QUARTERMASTER_SQUARES_PER_SHIFT);
/** A shift counts while now - shiftedAt < one game day (a shift exactly one game day old has expired). */
export const quartermasterWindowStart = (nowSec: number) => nowSec - ARMY_GAME_DAY_SECONDS + 1;

/** Mirrored by drizzle/0110_army_quartermaster_shifts.sql. */
export const armyQuartermasterSchemas = [
  `CREATE TABLE IF NOT EXISTS army_quartermaster_shifts (request_id TEXT PRIMARY KEY, clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE, unit_id TEXT NOT NULL, game_day INTEGER NOT NULL, shifted_at INTEGER NOT NULL, UNIQUE(clerk_user_id, game_day))`,
  'CREATE INDEX IF NOT EXISTS idx_army_qm_unit_at ON army_quartermaster_shifts(unit_id, shifted_at)',
];
/** Extra supply squares per nation: shifts by current members of the unit, in the last game day. One read. */
export async function readQuartermasterExtra(db: GameDatabase, nowSec: number): Promise<Map<string, number>> {
  const rows = await db.prepare(`SELECT q.unit_id, COUNT(*) AS n FROM army_quartermaster_shifts q JOIN army_members m ON m.clerk_user_id = q.clerk_user_id AND m.unit_id = q.unit_id
    WHERE q.shifted_at >= ? AND q.shifted_at <= ? GROUP BY q.unit_id`).bind(quartermasterWindowStart(nowSec), nowSec).all<{ unit_id: string; n: number }>();
  const out = new Map<string, number>();
  for (const r of rows.results ?? []) { const u = armyUnits.find(x => x.id === r.unit_id); if (u) out.set(u.nationId, quartermasterExtra(Number(r.n))); }
  return out;
}
type ShiftFail = { ok: false; status: 409; error: string; reason: 'not_member' | 'already_shifted' | 'request_conflict' };
/** Same replay and race handling as runDrill: the insert outcome decides. */
export async function runQuartermasterShift(db: GameDatabase, userId: string, requestId: string, nowSec: number): Promise<{ ok: true; replayed: boolean } | ShiftFail> {
  const seen = () => db.prepare('SELECT clerk_user_id FROM army_quartermaster_shifts WHERE request_id = ?').bind(requestId).first<{ clerk_user_id: string }>();
  const decide = (row: { clerk_user_id: string }): { ok: true; replayed: true } | ShiftFail => row.clerk_user_id === userId ? { ok: true, replayed: true } : { ok: false, status: 409, error: 'That request identifier was already used.', reason: 'request_conflict' };
  const prior = await seen();
  if (prior) return decide(prior);
  const day = Math.floor(nowSec / ARMY_GAME_DAY_SECONDS);
  const res = await db.prepare(`INSERT INTO army_quartermaster_shifts (request_id, clerk_user_id, unit_id, game_day, shifted_at)
    SELECT ?, ?, unit_id, ?, ? FROM army_members WHERE clerk_user_id = ? ON CONFLICT DO NOTHING`).bind(requestId, userId, day, nowSec, userId).run();
  if (Number(res.meta?.changes ?? 0) === 1) return { ok: true, replayed: false };
  const after = await seen();
  if (after) return decide(after);
  const member = await db.prepare('SELECT 1 AS x FROM army_members WHERE clerk_user_id = ?').bind(userId).first();
  return member ? { ok: false, status: 409, error: 'You already ran a quartermaster shift this game day.', reason: 'already_shifted' } : { ok: false, status: 409, error: 'You are not in a unit.', reason: 'not_member' };
}
