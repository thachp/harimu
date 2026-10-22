/** #739 slice 1 (docs §17.4 Citizen dormancy): Away at 7 real days, Dormant at 30, Archived at 180. Status and the Welcome back
 *  briefing only, no effects (quotas, quorum, job release, savings shield are later slices). Flag HARIMU_DORMANCY_ENABLED
 *  ("true" in preview, "false" in production); flag off = no read or write of citizens.last_active_at and no briefing. */
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

/** The read for GET /api/citizen: runs in the route's first parallel wave, so it adds no serial round trip. */
export const readLastActive = (db: GameDatabase, userId: string) =>
  db.prepare('SELECT last_active_at FROM citizens WHERE clerk_user_id = ?').bind(userId).first<{ last_active_at: string | null }>();

/** From the value read BEFORE the bump: the briefing to show (Away or longer, once: the bump makes the next load active) and whether to bump. */
export function dormancyOnLoad(row: { last_active_at: string | null } | null, now: number) {
  if (!row) return { welcomeBack: null, bump: false };
  const last = seconds(row.last_active_at), status = dormancyStatus(last, now);
  return { welcomeBack: status === 'active' || last === null ? null : { status, since: new Date(last * 1000).toISOString() }, bump: last === null || now - last >= ACTIVITY_BUMP_SECONDS };
}

/** The hourly bump: one UPDATE with a time guard (a concurrent load that already bumped writes nothing). Runs in the route's second wave. */
export const bumpLastActive = (db: GameDatabase, userId: string, now: number) => {
  const at = new Date(now * 1000).toISOString(), floor = new Date((now - ACTIVITY_BUMP_SECONDS) * 1000).toISOString();
  return db.prepare('UPDATE citizens SET last_active_at = ? WHERE clerk_user_id = ? AND (last_active_at IS NULL OR last_active_at <= ?)').bind(at, userId, floor).run();
};
