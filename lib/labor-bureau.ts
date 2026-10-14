import type { GameDatabase } from './database-contract';
import { bureauJobs, assignJob, validPreferences, nextRequestAt, reassignmentSeconds, jobById, quotaGap, type BureauOutcome, type BureauReason } from './labor-bureau-rules';

/** Korund Labor Bureau (#235), behind HARIMU_LABOR_BUREAU_ENABLED (off). Assignments are recorded; shift pay is unchanged. */
export const laborBureauSchemas = [
  `CREATE TABLE IF NOT EXISTS korund_job_preferences (
 clerk_user_id TEXT PRIMARY KEY REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 first_job TEXT NOT NULL, second_job TEXT NOT NULL, third_job TEXT NOT NULL,
 filed_at INTEGER NOT NULL,
 CHECK(first_job <> second_job AND first_job <> third_job AND second_job <> third_job)
)`,
  `CREATE TABLE IF NOT EXISTS korund_job_assignments (
 id TEXT PRIMARY KEY,
 clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 job_id TEXT NOT NULL,
 outcome TEXT NOT NULL CHECK(outcome IN ('first-choice','lower-choice','quota-posting')),
 reasons TEXT NOT NULL,
 assigned_at INTEGER NOT NULL
)`,
  'CREATE INDEX IF NOT EXISTS idx_korund_job_assignments_citizen ON korund_job_assignments(clerk_user_id, assigned_at)',
] as const;

export type BureauView = {
  jobs: { id: string; name: string; seats: number; filled: number; open: number }[];
  preferences: string[] | null;
  assignment: { jobId: string; jobName: string; outcome: BureauOutcome; reasons: BureauReason[]; assignedAt: string } | null;
  nextRequestAt: string | null;
  canRequest: boolean;
};
export type BureauResult = { status: number; error?: string; reason?: string; replayed?: boolean; nextRequestAt?: string };

const latestSql = `a.assigned_at=(SELECT MAX(assigned_at) FROM korund_job_assignments WHERE clerk_user_id=a.clerk_user_id)`;
async function filledCounts(db: GameDatabase, exceptUser: string | null) {
  const { results } = await db.prepare(`SELECT a.job_id AS job_id, COUNT(*) AS n FROM korund_job_assignments a WHERE ${latestSql} AND a.clerk_user_id<>? GROUP BY a.job_id`)
    .bind(exceptUser ?? '').all<{ job_id: string; n: number }>();
  return Object.fromEntries((results ?? []).map(r => [r.job_id, Number(r.n)])) as Record<string, number>;
}
const iso = (seconds: number) => new Date(seconds * 1000).toISOString();

export async function readBureau(db: GameDatabase, userId: string, now: number): Promise<BureauView> {
  const [filled, prefs, last] = await Promise.all([
    filledCounts(db, null),
    db.prepare('SELECT first_job, second_job, third_job FROM korund_job_preferences WHERE clerk_user_id=?').bind(userId).first<{ first_job: string; second_job: string; third_job: string }>(),
    db.prepare('SELECT job_id, outcome, reasons, assigned_at FROM korund_job_assignments WHERE clerk_user_id=? ORDER BY assigned_at DESC LIMIT 1').bind(userId)
      .first<{ job_id: string; outcome: BureauOutcome; reasons: string; assigned_at: number }>(),
  ]);
  const next = nextRequestAt(last ? Number(last.assigned_at) : null, now);
  return {
    jobs: bureauJobs.map(j => ({ id: j.id, name: j.name, seats: j.seats, filled: Number(filled[j.id] ?? 0), open: quotaGap(j, filled) })),
    preferences: prefs ? [prefs.first_job, prefs.second_job, prefs.third_job] : null,
    assignment: last ? { jobId: last.job_id, jobName: jobById(last.job_id)?.name ?? last.job_id, outcome: last.outcome, reasons: JSON.parse(last.reasons) as BureauReason[], assignedAt: iso(Number(last.assigned_at)) } : null,
    nextRequestAt: next === null ? null : iso(next),
    canRequest: Boolean(prefs) && next === null,
  };
}

export async function setPreferences(db: GameDatabase, userId: string, preferences: unknown, now: number): Promise<BureauResult> {
  const prefs = validPreferences(preferences);
  if (!prefs) return { status: 400, reason: 'bad_preferences', error: 'List exactly three different jobs from the Labor Bureau list.' };
  await db.prepare(`INSERT INTO korund_job_preferences(clerk_user_id, first_job, second_job, third_job, filed_at) VALUES (?,?,?,?,?)
    ON CONFLICT(clerk_user_id) DO UPDATE SET first_job=excluded.first_job, second_job=excluded.second_job, third_job=excluded.third_job, filed_at=excluded.filed_at`)
    .bind(userId, prefs[0], prefs[1], prefs[2], now).run();
  return { status: 200 };
}

/** First assignment, or a reassignment request: allowed once per 30 real days (the guard is inside the insert). */
export async function requestAssignment(db: GameDatabase, userId: string, requestId: string, now: number): Promise<BureauResult> {
  const prior = await db.prepare('SELECT clerk_user_id FROM korund_job_assignments WHERE id=?').bind(requestId).first<{ clerk_user_id: string }>();
  if (prior) return prior.clerk_user_id === userId ? { status: 200, replayed: true } : { status: 409, reason: 'request_reused', error: 'Request identifier already used.' };
  const prefs = await db.prepare('SELECT first_job, second_job, third_job FROM korund_job_preferences WHERE clerk_user_id=?').bind(userId).first<{ first_job: string; second_job: string; third_job: string }>();
  if (!prefs) return { status: 409, reason: 'no_preferences', error: 'File three job preferences first.' };
  const last = await db.prepare('SELECT MAX(assigned_at) AS at FROM korund_job_assignments WHERE clerk_user_id=?').bind(userId).first<{ at: number | null }>();
  const next = nextRequestAt(last?.at == null ? null : Number(last.at), now);
  if (next !== null) return { status: 409, reason: 'too_soon', nextRequestAt: iso(next), error: `Reassignment is not available yet. Your next request opens on ${iso(next)}.` };
  const [shifts, citizen, filled] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS n FROM korund_settlements WHERE clerk_user_id=?').bind(userId).first<{ n: number }>(),
    db.prepare('SELECT standing FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ standing: string | null }>(),
    filledCounts(db, userId),
  ]);
  const result = assignJob({ preferences: [prefs.first_job, prefs.second_job, prefs.third_job], shifts: Number(shifts?.n ?? 0), standing: citizen?.standing ?? null, filled });
  await db.prepare(`INSERT INTO korund_job_assignments(id, clerk_user_id, job_id, outcome, reasons, assigned_at)
    SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM korund_job_assignments WHERE clerk_user_id=? AND assigned_at>?)
    ON CONFLICT DO NOTHING`).bind(requestId, userId, result.jobId, result.outcome, JSON.stringify(result.reasons), now, userId, now - reassignmentSeconds).run();
  const created = await db.prepare('SELECT clerk_user_id FROM korund_job_assignments WHERE id=?').bind(requestId).first<{ clerk_user_id: string }>();
  return created?.clerk_user_id === userId ? { status: 200 } : { status: 409, reason: 'too_soon', error: 'Reassignment is not available yet.' };
}
