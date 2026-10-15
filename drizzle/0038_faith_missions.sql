-- Issue #225: additive cross-border missionaries (missions, answers, mutes). Existing data is preserved. Written only by POST actions behind HARIMU_FAITH_ENABLED.
CREATE TABLE IF NOT EXISTS faith_missions (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 faith_id TEXT NOT NULL CHECK(faith_id IN ('kinward-rite','fair-wind-vow','open-hand')),
 home_nation TEXT NOT NULL CHECK(home_nation IN ('kindle','korund','aurelle')),
 host_nation TEXT NOT NULL CHECK(host_nation IN ('kindle','korund','aurelle')),
 host_city_id TEXT NOT NULL,
 requested_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 accepted_at INTEGER,
 arrives_at INTEGER,
 ends_at INTEGER,
 closed_at INTEGER,
 request_id TEXT NOT NULL UNIQUE,
 accept_request_id TEXT UNIQUE,
 CHECK(home_nation<>host_nation),
 CHECK((accepted_at IS NULL)=(arrives_at IS NULL) AND (accepted_at IS NULL)=(ends_at IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_faith_missions_one_open ON faith_missions(user_id) WHERE closed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_faith_missions_host ON faith_missions(host_nation, host_city_id, arrives_at);
CREATE TABLE IF NOT EXISTS missionary_responses (
 user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 mission_id TEXT NOT NULL,
 outcome TEXT NOT NULL CHECK(outcome IN ('accepted','declined')),
 responded_at INTEGER NOT NULL,
 request_id TEXT NOT NULL UNIQUE,
 PRIMARY KEY(user_id, mission_id)
);
CREATE INDEX IF NOT EXISTS idx_missionary_responses_user ON missionary_responses(user_id, responded_at);
CREATE TABLE IF NOT EXISTS missionary_mutes (
 user_id TEXT PRIMARY KEY REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 muted_at INTEGER NOT NULL
);
