-- Issue #235: Korund Labor Bureau (3 job preferences, AI assignment, 30-day reassignment). Additive only; runtime use is behind HARIMU_LABOR_BUREAU_ENABLED (off).
CREATE TABLE IF NOT EXISTS korund_job_preferences (
 clerk_user_id TEXT COLLATE "C" PRIMARY KEY REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 first_job TEXT COLLATE "C" NOT NULL, second_job TEXT COLLATE "C" NOT NULL, third_job TEXT COLLATE "C" NOT NULL,
 filed_at BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(filed_at) = 'integer'),
 CHECK(first_job <> second_job AND first_job <> third_job AND second_job <> third_job)
);
CREATE TABLE IF NOT EXISTS korund_job_assignments (
 id TEXT COLLATE "C" PRIMARY KEY,
 clerk_user_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 job_id TEXT COLLATE "C" NOT NULL,
 outcome TEXT COLLATE "C" NOT NULL CHECK(outcome IN ('first-choice','lower-choice','quota-posting')),
 reasons TEXT COLLATE "C" NOT NULL,
 assigned_at BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(assigned_at) = 'integer')
);
CREATE INDEX IF NOT EXISTS idx_korund_job_assignments_citizen ON korund_job_assignments(clerk_user_id, assigned_at);
