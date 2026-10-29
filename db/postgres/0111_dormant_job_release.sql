-- Issue #1066: dormant citizens release their job (docs §17.4), flag HARIMU_DORMANCY_ENABLED. Additive; one row per absence.
CREATE TABLE IF NOT EXISTS dormant_job_releases (
 absence_key TEXT COLLATE "C" PRIMARY KEY,
 clerk_user_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 job_id TEXT COLLATE "C" NOT NULL,
 released_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dormant_job_releases_citizen ON dormant_job_releases(clerk_user_id, released_at);
