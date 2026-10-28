/** #738 slice 1: army membership reads and commands. Migration 0072 (drizzle/ + db/postgres/) mirrors armySchemas. */
import type { GameDatabase } from './database-contract';
import { serviceUntil } from './army-conscription';
import { volunteerNations, defaultStance, unitById, unitForNation, ARMY_GAME_DAY_SECONDS, armyParticipation, unitStrength, unitMorale, type ArmyCommand } from './army-rules';
export const armySchemas = [
  `CREATE TABLE IF NOT EXISTS army_members (clerk_user_id TEXT PRIMARY KEY REFERENCES citizens(clerk_user_id), unit_id TEXT NOT NULL, stance TEXT NOT NULL CHECK(stance IN ('hold','advance','fall_back')), joined_at INTEGER NOT NULL, request_id TEXT NOT NULL UNIQUE)`,
  'CREATE INDEX IF NOT EXISTS idx_army_members_unit ON army_members(unit_id)',
  // [ASSUMPTION] Leave and stance need replay too, and a deleted member row cannot remember its request id, so every command is logged once here.
  `CREATE TABLE IF NOT EXISTS army_requests (request_id TEXT PRIMARY KEY, clerk_user_id TEXT NOT NULL, action TEXT NOT NULL CHECK(action IN ('join','leave','stance')), occurred_at INTEGER NOT NULL)`,
];
export type ArmyView = { serveUntil?: number; woundedUntil?: number; unit: { id: string; name: string; officer: string; memberCount: number; openToVolunteers: boolean; strength?: number; morale?: number; supply?: { cut: boolean; cutDays: number; strengthLossPct: number }; battle?: { opponentNationId: string; attacking: boolean; rounds: number; status: 'ongoing' | 'attacker_won' | 'defender_won' } } | null; member: boolean; stance: string | null };
type Fail = { ok: false; status: 403 | 409; error: string; reason: string };
/** The citizen's own nation's unit, membership and stance, and the unit's member count. Never another member's identity. */
export async function readArmy(db: GameDatabase, userId: string, nowSec = 0, readiness = false): Promise<ArmyView> {
  const row = await db.prepare(`SELECT c.nation_id, m.unit_id, m.stance FROM citizens c LEFT JOIN army_members m ON m.clerk_user_id=c.clerk_user_id WHERE c.clerk_user_id=?`).bind(userId).first<{ nation_id: string | null; unit_id: string | null; stance: string | null }>();
  const unit = unitById(row?.unit_id) ?? unitForNation(row?.nation_id);
  if (!unit) return { unit: null, member: false, stance: null };
  const count = await db.prepare('SELECT COUNT(*) AS n FROM army_members WHERE unit_id=?').bind(unit.id).first<{ n: number }>();
  // #738 slice 2: strength and morale only with HARIMU_ARMY_DRILLS_ENABLED (flag off: no extra reads, the slice-1 shape).
  const extra = readiness ? await readUnitReadiness(db, unit.id, nowSec) : {};
  return { unit: { id: unit.id, name: unit.name, officer: unit.officer, memberCount: Number(count?.n ?? 0), openToVolunteers: volunteerNations.includes(unit.nationId), ...extra }, member: !!row?.unit_id, stance: row?.stance ?? null };
}
export async function runArmyCommand(db: GameDatabase, userId: string, cmd: ArmyCommand, nowSec: number, retried = false): Promise<({ ok: true; replayed: boolean } & ArmyView) | Fail> {
  const seen = await db.prepare('SELECT clerk_user_id, action FROM army_requests WHERE request_id=?').bind(cmd.requestId).first<{ clerk_user_id: string; action: string }>();
  if (seen) return seen.clerk_user_id === userId && seen.action === cmd.action ? { ok: true, replayed: true, ...await readArmy(db, userId) } : { ok: false, status: 409, error: 'That request identifier was already used.', reason: 'request_conflict' };
  const me = await db.prepare(`SELECT c.nation_id, m.unit_id FROM citizens c LEFT JOIN army_members m ON m.clerk_user_id=c.clerk_user_id WHERE c.clerk_user_id=?`).bind(userId).first<{ nation_id: string | null; unit_id: string | null }>();
  const log = db.prepare('INSERT INTO army_requests (request_id, clerk_user_id, action, occurred_at) VALUES (?,?,?,?)').bind(cmd.requestId, userId, cmd.action, nowSec);
  let write;
  if (cmd.action === 'join') {
    const unit = unitById(cmd.unitId);
    if (!unit || unit.nationId !== me?.nation_id) return { ok: false, status: 403, error: 'You can only join your own nation\u2019s unit.', reason: 'not_eligible' };
    if (!volunteerNations.includes(unit.nationId)) return { ok: false, status: 403, error: 'This unit does not take volunteers yet.', reason: 'not_open_yet' };
    if (me.unit_id) return { ok: false, status: 409, error: 'You are already in a unit.', reason: 'already_member' };
    write = db.prepare('INSERT INTO army_members (clerk_user_id, unit_id, stance, joined_at, request_id) VALUES (?,?,?,?,?)').bind(userId, unit.id, defaultStance, nowSec, cmd.requestId);
  } else {
    if (!me?.unit_id) return { ok: false, status: 409, error: 'You are not in a unit.', reason: 'not_member' };
    // #738 slice 3: a conscript cannot leave before the service term ends.
    if (cmd.action === 'leave' && await serviceUntil(db, userId, nowSec)) return { ok: false, status: 409, error: 'You were called up and serve until your term ends.', reason: 'conscripted' };
    write = cmd.action === 'leave' ? db.prepare('DELETE FROM army_members WHERE clerk_user_id=?').bind(userId)
      : db.prepare('UPDATE army_members SET stance=? WHERE clerk_user_id=?').bind(cmd.stance, userId);
  }
  // Both rows or neither. A unique-key race (same request id, or a second join) re-reads once: replay or the plain refusal.
  try { await db.batch([log, write]); }
  catch (error) { if (retried) throw error; return runArmyCommand(db, userId, cmd, nowSec, true); }
  return { ok: true, replayed: false, ...await readArmy(db, userId) };
}

/** #738 slice 2: one drill per member per game day (migration 0078 mirrors armyDrillSchemas). */
export const armyDrillSchemas = [
  `CREATE TABLE IF NOT EXISTS army_drills (request_id TEXT PRIMARY KEY, clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE, unit_id TEXT NOT NULL, game_day INTEGER NOT NULL, drilled_at INTEGER NOT NULL, UNIQUE(clerk_user_id, game_day))`,
  'CREATE INDEX IF NOT EXISTS idx_army_drills_unit_day ON army_drills(unit_id, game_day)',
];
/** Strength and morale from current members' drills and settled shifts in the window. Aggregates only, never identities. */
export async function readUnitReadiness(db: GameDatabase, unitId: string, nowSec: number) {
  const fromDay = Math.floor(nowSec / ARMY_GAME_DAY_SECONDS) - armyParticipation.windowDays + 1;
  const fromIso = new Date(fromDay * ARMY_GAME_DAY_SECONDS * 1000).toISOString();
  const row = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM army_members WHERE unit_id = ?) AS members,
      (SELECT COUNT(*) FROM army_drills d JOIN army_members m ON m.clerk_user_id = d.clerk_user_id AND m.unit_id = d.unit_id WHERE d.unit_id = ? AND d.game_day >= ? AND d.drilled_at >= m.joined_at) AS drills,
      (SELECT COUNT(DISTINCT d.clerk_user_id) FROM army_drills d JOIN army_members m ON m.clerk_user_id = d.clerk_user_id AND m.unit_id = d.unit_id WHERE d.unit_id = ? AND d.game_day >= ? AND d.drilled_at >= m.joined_at) AS drilled`)
    .bind(unitId, unitId, fromDay, unitId, fromDay).first<{ members: number; drills: number; drilled: number }>();
  // ARC on #836: only shifts settled after the member joined count, so recruiting veterans cannot inflate strength. settled_at is ISO text and
  // joined_at epoch seconds, so the per-member comparison runs here (at most 7 game days of shifts).
  const settled = await db.prepare('SELECT s.settled_at, m.joined_at FROM shift_settlements s JOIN army_members m ON m.clerk_user_id = s.clerk_user_id WHERE m.unit_id = ? AND s.settled_at >= ?')
    .bind(unitId, fromIso).all<{ settled_at: string; joined_at: number }>();
  const shifts = (settled.results ?? []).filter(x => Date.parse(x.settled_at) / 1000 >= Number(x.joined_at)).length;
  const [members, drills, drilled] = [row?.members, row?.drills, row?.drilled].map(n => Number(n ?? 0));
  return { strength: unitStrength(members, drills, shifts), morale: unitMorale(members, drilled) };
}
type DrillFail = { ok: false; status: 409; error: string; reason: 'not_member' | 'already_drilled' | 'request_conflict' };
/** Replay: the same citizen's request id returns the current state and writes nothing; another citizen's id is a conflict. A concurrent
 *  duplicate is decided by the insert outcome (meta.changes): only the winning insert reports replayed false. */
export async function runDrill(db: GameDatabase, userId: string, requestId: string, nowSec: number): Promise<{ ok: true; replayed: boolean; view: ArmyView } | DrillFail> {
  const seen = async () => db.prepare('SELECT clerk_user_id, game_day FROM army_drills WHERE request_id = ?').bind(requestId).first<{ clerk_user_id: string; game_day: number }>();
  const conflict: DrillFail = { ok: false, status: 409, error: 'That request identifier was already used.', reason: 'request_conflict' };
  const prior = await seen();
  if (prior) return prior.clerk_user_id === userId ? { ok: true, replayed: true, view: await readArmy(db, userId, nowSec, true) } : conflict;
  const me = await db.prepare('SELECT unit_id FROM army_members WHERE clerk_user_id = ?').bind(userId).first<{ unit_id: string }>();
  if (!me) return { ok: false, status: 409, error: 'You are not in a unit.', reason: 'not_member' };
  const day = Math.floor(nowSec / ARMY_GAME_DAY_SECONDS);
  const res = await db.prepare(`INSERT INTO army_drills (request_id, clerk_user_id, unit_id, game_day, drilled_at)
    SELECT ?, ?, unit_id, ?, ? FROM army_members WHERE clerk_user_id = ? ON CONFLICT DO NOTHING`).bind(requestId, userId, day, nowSec, userId).run();
  if (Number(res.meta?.changes ?? 0) !== 1) {
    const after = await seen(); // lost a race: same request id (replay or conflict), or a second drill this game day, or the member left
    if (after) return after.clerk_user_id === userId ? { ok: true, replayed: true, view: await readArmy(db, userId, nowSec, true) } : conflict;
    const still = await db.prepare('SELECT 1 AS x FROM army_members WHERE clerk_user_id = ?').bind(userId).first();
    return still ? { ok: false, status: 409, error: 'You already drilled this game day.', reason: 'already_drilled' } : { ok: false, status: 409, error: 'You are not in a unit.', reason: 'not_member' };
  }
  return { ok: true, replayed: false, view: await readArmy(db, userId, nowSec, true) };
}
