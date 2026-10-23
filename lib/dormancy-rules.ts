/** #739 slice 1 (docs §17.4 Citizen dormancy): Away at 7 real days, Dormant at 30, Archived at 180. Status and the Welcome back
 *  briefing only, no effects (quotas, quorum, job release, savings shield are later slices). Flag HARIMU_DORMANCY_ENABLED
 *  ("true" in preview, "false" in production); flag off = no read or write of citizens.last_active_at and no briefing.
 *  GET /api/citizen never touches it (#205, ARC): the write is POST /api/citizen/heartbeat. */
import type { GameDatabase } from './database-contract';

export type DormancyState = 'active' | 'away' | 'dormant' | 'archived';
const DAY = 86_400;
/** The docs' thresholds, in real days. */
export const DORMANCY_DAYS = Object.freeze({ away: 7, dormant: 30, archived: 180 });
/** last_active_at is bumped at most once per real hour per citizen. */
export const ACTIVITY_BUMP_SECONDS = 3_600;

export const dormancyEnabled = (env: { HARIMU_DORMANCY_ENABLED?: string } | null | undefined) => env?.HARIMU_DORMANCY_ENABLED === 'true';

/** Status after `seconds` of inactivity (both in seconds). Unknown or future activity counts as active. */
export function dormancyStatus(lastActiveAt: number | null | undefined, now: number): DormancyState {
  if (lastActiveAt == null || !Number.isFinite(lastActiveAt)) return 'active';
  const idle = now - lastActiveAt;
  if (idle >= DORMANCY_DAYS.archived * DAY) return 'archived';
  if (idle >= DORMANCY_DAYS.dormant * DAY) return 'dormant';
  if (idle >= DORMANCY_DAYS.away * DAY) return 'away';
  return 'active';
}

const seconds = (iso: string | null | undefined) => { const t = iso ? Date.parse(iso) : NaN; return Number.isFinite(t) ? Math.floor(t / 1000) : null; };

/** POST /api/citizen/heartbeat: read the prior value, then one guarded UPDATE (at most hourly). The briefing comes from the prior value and
 *  only from the request whose UPDATE changed the row, so two tabs loading at once still show it once. No citizen row: nothing is written. */
export async function heartbeat(db: GameDatabase, userId: string, now: number): Promise<{ bumped: boolean; welcomeBack: { status: Exclude<DormancyState, 'active'>; since: string } | null }> {
  const row = await db.prepare('SELECT last_active_at FROM citizens WHERE clerk_user_id = ?').bind(userId).first<{ last_active_at: string | null }>();
  if (!row) return { bumped: false, welcomeBack: null };
  const last = seconds(row.last_active_at);
  if (last !== null && now - last < ACTIVITY_BUMP_SECONDS) return { bumped: false, welcomeBack: null };
  const at = new Date(now * 1000).toISOString(), floor = new Date((now - ACTIVITY_BUMP_SECONDS) * 1000).toISOString();
  // Compare-and-set on the prior value: of several parallel first loads only one changes the row, and only it returns the briefing.
  // An unparseable value is treated like NULL (QA1): no briefing, and it is overwritten (compare-and-set on the raw value, no hourly floor).
  const saved = row.last_active_at === null
    ? await db.prepare('UPDATE citizens SET last_active_at = ? WHERE clerk_user_id = ? AND last_active_at IS NULL').bind(at, userId).run()
    : last === null
    ? await db.prepare('UPDATE citizens SET last_active_at = ? WHERE clerk_user_id = ? AND last_active_at = ?').bind(at, userId, row.last_active_at).run()
    : await db.prepare('UPDATE citizens SET last_active_at = ? WHERE clerk_user_id = ? AND last_active_at = ? AND last_active_at <= ?').bind(at, userId, row.last_active_at, floor).run();
  if (!saved.meta.changes) return { bumped: false, welcomeBack: null };
  const status = dormancyStatus(last, now);
  return { bumped: true, welcomeBack: status === 'active' || last === null ? null : { status, since: new Date(last * 1000).toISOString() } };
}
