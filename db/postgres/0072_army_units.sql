-- Issue #738 slice 1: army units (docs §15.3). Home-guard membership and a command log for request-id replay, flag HARIMU_ARMIES_ENABLED (off in production). Additive only.
CREATE TABLE IF NOT EXISTS army_members (clerk_user_id TEXT COLLATE "C" PRIMARY KEY REFERENCES citizens(clerk_user_id), unit_id TEXT COLLATE "C" NOT NULL, stance TEXT COLLATE "C" NOT NULL CHECK(stance IN ('hold','advance','fall_back')), joined_at BIGINT NOT NULL, request_id TEXT COLLATE "C" NOT NULL UNIQUE);
CREATE INDEX IF NOT EXISTS idx_army_members_unit ON army_members(unit_id);
CREATE TABLE IF NOT EXISTS army_requests (request_id TEXT COLLATE "C" PRIMARY KEY, clerk_user_id TEXT COLLATE "C" NOT NULL, action TEXT COLLATE "C" NOT NULL CHECK(action IN ('join','leave','stance')), occurred_at BIGINT NOT NULL);
