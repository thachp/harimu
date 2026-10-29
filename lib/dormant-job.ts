/** #1066 (docs §17.4, follow-up to #739): a Dormant or Archived citizen (30+ real days) releases their job.
 *  Away (7–29 days) keeps it. Same flag as dormancy, HARIMU_DORMANCY_ENABLED: callers run this only when the flag is on.
 *  Lazy: the existing world pass (advanceWorld when dormancy is set) and POST /api/citizen/heartbeat, before the activity bump.
 *  No new cron. Idempotent per absence (user id + the last_active_at of that absence).
 *  [ASSUMPTION] the held job is the latest Korund Labor Bureau assignment not already released, else the unclaimed work shift.
 *  The shift is deleted, not marked claimed, so it is not a worked shift and it pays nothing. A shift that already settled is left as it is.
 *  Home, items, savings and Work Capacity already spent are not touched. */
import type { GameDatabase } from './database-contract';
import { dormantAt } from './dormancy-rules';

export const dormantJobSchemas = [
  `CREATE TABLE IF NOT EXISTS dormant_job_releases (
  absence_key TEXT PRIMARY KEY,
  clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
  job_id TEXT NOT NULL,
  released_at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS idx_dormant_job_releases_citizen ON dormant_job_releases(clerk_user_id, released_at)',
] as const;

const heldJob = `(SELECT a.job_id FROM korund_job_assignments a WHERE a.clerk_user_id=c.clerk_user_id AND a.assigned_at>COALESCE((SELECT MAX(released_at) FROM dormant_job_releases WHERE clerk_user_id=c.clerk_user_id),0) ORDER BY a.assigned_at DESC LIMIT 1)`;
const openShift = `(SELECT s.work_order_id FROM work_shifts s WHERE s.clerk_user_id=c.clerk_user_id AND s.claimed_at IS NULL ORDER BY s.started_at DESC LIMIT 1)`;
const dormantCitizens = (user: boolean) => `c.last_active_at IS NOT NULL AND length(c.last_active_at)=24 AND c.last_active_at<=?${user ? ' AND c.clerk_user_id=?' : ''}`;
/** Unclaimed shifts only, and never one that already settled (that pay stays). */
const doomed = (user: boolean) => `SELECT s.id FROM work_shifts s WHERE s.claimed_at IS NULL AND s.clerk_user_id IN (
  SELECT c.clerk_user_id FROM citizens c WHERE ${dormantCitizens(user)})
  AND NOT EXISTS (SELECT 1 FROM shift_settlements t WHERE t.shift_id=s.id)
  AND NOT EXISTS (SELECT 1 FROM korund_settlements t WHERE t.shift_id=s.id)
  AND NOT EXISTS (SELECT 1 FROM nation_wage_settlements t WHERE t.shift_id=s.id)
  AND NOT EXISTS (SELECT 1 FROM aurelle_settlements t WHERE t.shift_id=s.id)
  AND NOT EXISTS (SELECT 1 FROM aurelle_charter_settlements t WHERE t.shift_id=s.id)
  AND NOT EXISTS (SELECT 1 FROM korund_post_settlements t WHERE t.shift_id=s.id)
  AND NOT EXISTS (SELECT 1 FROM crown_issuances t WHERE t.shift_id=s.id)
  AND NOT EXISTS (SELECT 1 FROM labor_note_issuances t WHERE t.shift_id=s.id)`;

/** Statements for one batch. advanceWorld appends these to its clock batch so a world GET gains no round trip (#679). */
export function dormantJobStatements(db: GameDatabase, now: number, userId?: string) {
  const cut = dormantAt(now), one = Boolean(userId), tail = one ? [cut, userId] : [cut];
  const drop = (table: string, column: string) => db.prepare(`DELETE FROM ${table} WHERE ${column} IN (${doomed(one)})`).bind(...tail);
  return [
    db.prepare(`INSERT INTO dormant_job_releases (absence_key,clerk_user_id,job_id,released_at)
      SELECT absence_key,clerk_user_id,job_id,? FROM (
        SELECT c.clerk_user_id || ':' || c.last_active_at AS absence_key, c.clerk_user_id AS clerk_user_id, COALESCE(${heldJob}, ${openShift}) AS job_id
        FROM citizens c WHERE ${dormantCitizens(one)}
      ) held WHERE job_id IS NOT NULL ON CONFLICT (absence_key) DO NOTHING`).bind(now, ...tail),
    drop('shift_rewards', 'shift_id'), drop('shift_quality', 'shift_id'), drop('korund_work_starts', 'id'), drop('nation_wage_starts', 'shift_id'),
    db.prepare(`DELETE FROM work_shifts WHERE id IN (${doomed(one)})`).bind(...tail),
  ];
}

/** Release every dormant citizen, or one citizen when userId is set. Safe to call again. */
export async function releaseDormantJobs(db: GameDatabase, now: number, userId?: string): Promise<void> {
  await db.batch(dormantJobStatements(db, now, userId));
}

/** True when this absence (the raw last_active_at, not a reformatted copy) released a job. */
export async function jobWasReleased(db: GameDatabase, userId: string, lastActiveAt: string): Promise<boolean> {
  const row = await db.prepare('SELECT 1 AS yes FROM dormant_job_releases WHERE absence_key=?').bind(`${userId}:${lastActiveAt}`).first<{ yes: number }>();
  return row != null;
}
