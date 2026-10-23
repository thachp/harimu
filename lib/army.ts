/** #738 slice 1: army membership reads and commands. Migration 0069 (drizzle/ + db/postgres/) mirrors armySchemas. */
import type { GameDatabase } from './database-contract';
import { volunteerNations, defaultStance, unitById, unitForNation, type ArmyCommand } from './army-rules';
export const armySchemas = [
  `CREATE TABLE IF NOT EXISTS army_members (clerk_user_id TEXT PRIMARY KEY REFERENCES citizens(clerk_user_id), unit_id TEXT NOT NULL, stance TEXT NOT NULL CHECK(stance IN ('hold','advance','fall_back')), joined_at INTEGER NOT NULL, request_id TEXT NOT NULL UNIQUE)`,
  'CREATE INDEX IF NOT EXISTS idx_army_members_unit ON army_members(unit_id)',
  // [ASSUMPTION] Leave and stance need replay too, and a deleted member row cannot remember its request id, so every command is logged once here.
  `CREATE TABLE IF NOT EXISTS army_requests (request_id TEXT PRIMARY KEY, clerk_user_id TEXT NOT NULL, action TEXT NOT NULL CHECK(action IN ('join','leave','stance')), occurred_at INTEGER NOT NULL)`,
];
export type ArmyView = { unit: { id: string; name: string; officer: string; memberCount: number } | null; member: boolean; stance: string | null };
type Fail = { ok: false; status: 403 | 409; error: string; reason: string };
/** The citizen's own nation's unit, membership and stance, and the unit's member count. Never another member's identity. */
export async function readArmy(db: GameDatabase, userId: string): Promise<ArmyView> {
  const row = await db.prepare(`SELECT c.nation_id, m.unit_id, m.stance FROM citizens c LEFT JOIN army_members m ON m.clerk_user_id=c.clerk_user_id WHERE c.clerk_user_id=?`).bind(userId).first<{ nation_id: string | null; unit_id: string | null; stance: string | null }>();
  const unit = unitById(row?.unit_id) ?? unitForNation(row?.nation_id);
  if (!unit) return { unit: null, member: false, stance: null };
  const count = await db.prepare('SELECT COUNT(*) AS n FROM army_members WHERE unit_id=?').bind(unit.id).first<{ n: number }>();
  return { unit: { id: unit.id, name: unit.name, officer: unit.officer, memberCount: Number(count?.n ?? 0) }, member: !!row?.unit_id, stance: row?.stance ?? null };
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
    write = cmd.action === 'leave' ? db.prepare('DELETE FROM army_members WHERE clerk_user_id=?').bind(userId)
      : db.prepare('UPDATE army_members SET stance=? WHERE clerk_user_id=?').bind(cmd.stance, userId);
  }
  // Both rows or neither. A unique-key race (same request id, or a second join) re-reads once: replay or the plain refusal.
  try { await db.batch([log, write]); }
  catch (error) { if (retried) throw error; return runArmyCommand(db, userId, cmd, nowSec, true); }
  return { ok: true, replayed: false, ...await readArmy(db, userId) };
}
