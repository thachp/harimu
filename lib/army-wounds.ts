/** #911 (docs §15.4 Citizen safety): soldiers are never killed. When a unit retreats broken in a stored battle (#910; ARC on #944: that is "destroyed"), every member at that moment is wounded:
 *  out of action for 1–3 real days, deterministic from the battle key, so replays give the same times. No death and no gear loss: items are never
 *  touched. Behind HARIMU_ARMY_BATTLES_ENABLED (no new flag). Migration 0098 mirrors armyWoundSchemas. */
import type { GameDatabase } from './database-contract';

export const WOUNDED_MIN_SECONDS = 86400; // 1 real day
export const WOUNDED_MAX_SECONDS = 3 * 86400; // 3 real days
export const armyWoundSchemas = [
  `CREATE TABLE IF NOT EXISTS army_wounds (
 battle_key TEXT NOT NULL,
 clerk_user_id TEXT NOT NULL,
 wounded_until INTEGER NOT NULL,
 PRIMARY KEY (battle_key, clerk_user_id)
)`,
  'CREATE INDEX IF NOT EXISTS idx_army_wounds_user ON army_wounds(clerk_user_id, wounded_until)',
];
/** FNV-1a (32-bit) over battle key and citizen: a stable seed, so the same battle always gives the same time. */
export function woundSeed(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}
/** Wounded until: the battle's end plus 1–3 real days, from the seed. */
export const woundedUntil = (battleKey: string, userId: string, endedAt: number) =>
  endedAt + WOUNDED_MIN_SECONDS + woundSeed(`${battleKey}|${userId}`) % (WOUNDED_MAX_SECONDS - WOUNDED_MIN_SECONDS + 1);
/** The latest wound still running at `now`, or null. Read only. */
export async function readWoundedUntil(db: GameDatabase, userId: string, now: number) {
  const row = await db.prepare('SELECT MAX(wounded_until) AS until FROM army_wounds WHERE clerk_user_id = ? AND wounded_until > ?').bind(userId, now).first<{ until: number | null }>();
  return row?.until == null ? null : Number(row.until);
}
export const woundedRefusal = (until: number) => ({ error: 'You are wounded and out of action until you recover.', reason: 'wounded', woundedUntil: until });
