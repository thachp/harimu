-- Issue #235: Korund Labor Bureau (3 job preferences, AI assignment, 30-day reassignment). Additive; runtime use is behind HARIMU_LABOR_BUREAU_ENABLED (off).
CREATE TABLE IF NOT EXISTS korund_job_preferences (
 clerk_user_id TEXT PRIMARY KEY REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 first_job TEXT NOT NULL, second_job TEXT NOT NULL, third_job TEXT NOT NULL,
 filed_at INTEGER NOT NULL,
 CHECK(first_job <> second_job AND first_job <> third_job AND second_job <> third_job)
);
CREATE TABLE IF NOT EXISTS korund_job_assignments (
 id TEXT PRIMARY KEY,
 clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 job_id TEXT NOT NULL,
 outcome TEXT NOT NULL CHECK(outcome IN ('first-choice','lower-choice','quota-posting')),
 reasons TEXT NOT NULL,
 assigned_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_korund_job_assignments_citizen ON korund_job_assignments(clerk_user_id, assigned_at);
