-- Issue #1066: dormant citizens release their job (docs §17.4), flag HARIMU_DORMANCY_ENABLED. Additive; one row per absence.
CREATE TABLE IF NOT EXISTS dormant_job_releases (
 absence_key TEXT PRIMARY KEY,
 clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 job_id TEXT NOT NULL,
 released_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dormant_job_releases_citizen ON dormant_job_releases(clerk_user_id, released_at);
