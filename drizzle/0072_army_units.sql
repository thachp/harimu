-- Issue #738 slice 1: army units (docs §15.3). Home-guard membership and a command log for request-id replay, flag HARIMU_ARMIES_ENABLED (off in production). Additive only.
CREATE TABLE IF NOT EXISTS army_members (clerk_user_id TEXT PRIMARY KEY REFERENCES citizens(clerk_user_id), unit_id TEXT NOT NULL, stance TEXT NOT NULL CHECK(stance IN ('hold','advance','fall_back')), joined_at INTEGER NOT NULL, request_id TEXT NOT NULL UNIQUE);
CREATE INDEX IF NOT EXISTS idx_army_members_unit ON army_members(unit_id);
CREATE TABLE IF NOT EXISTS army_requests (request_id TEXT PRIMARY KEY, clerk_user_id TEXT NOT NULL, action TEXT NOT NULL CHECK(action IN ('join','leave','stance')), occurred_at INTEGER NOT NULL);
