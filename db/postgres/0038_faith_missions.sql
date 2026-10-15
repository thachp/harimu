-- Issue #225: additive cross-border missionaries (missions, answers, mutes). Existing data is preserved. Written only by POST actions behind HARIMU_FAITH_ENABLED.
CREATE TABLE IF NOT EXISTS faith_missions (
 id TEXT COLLATE "C" PRIMARY KEY,
 user_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 faith_id TEXT COLLATE "C" NOT NULL CHECK(faith_id IN ('kinward-rite','fair-wind-vow','open-hand')),
 home_nation TEXT COLLATE "C" NOT NULL CHECK(home_nation IN ('kindle','korund','aurelle')),
 host_nation TEXT COLLATE "C" NOT NULL CHECK(host_nation IN ('kindle','korund','aurelle')),
 host_city_id TEXT COLLATE "C" NOT NULL,
 requested_at BIGINT NOT NULL,
 expires_at BIGINT NOT NULL,
 accepted_at BIGINT,
 arrives_at BIGINT,
 ends_at BIGINT,
 closed_at BIGINT,
 request_id TEXT COLLATE "C" NOT NULL UNIQUE,
 accept_request_id TEXT COLLATE "C" UNIQUE,
 CHECK(home_nation<>host_nation),
 CHECK((accepted_at IS NULL)=(arrives_at IS NULL) AND (accepted_at IS NULL)=(ends_at IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_faith_missions_one_open ON faith_missions(user_id) WHERE closed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_faith_missions_host ON faith_missions(host_nation, host_city_id, arrives_at);
CREATE TABLE IF NOT EXISTS missionary_responses (
 user_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 mission_id TEXT COLLATE "C" NOT NULL,
 outcome TEXT COLLATE "C" NOT NULL CHECK(outcome IN ('accepted','declined')),
 responded_at BIGINT NOT NULL,
 request_id TEXT COLLATE "C" NOT NULL UNIQUE,
 PRIMARY KEY(user_id, mission_id)
);
CREATE INDEX IF NOT EXISTS idx_missionary_responses_user ON missionary_responses(user_id, responded_at);
CREATE TABLE IF NOT EXISTS missionary_mutes (
 user_id TEXT COLLATE "C" PRIMARY KEY REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 muted_at BIGINT NOT NULL
);
