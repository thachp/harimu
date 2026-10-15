-- Issue #442: additive Kindle canvassing quest records (display-only district visibility). Existing data is preserved.
CREATE TABLE IF NOT EXISTS canvass_quests (
 id TEXT COLLATE "C" PRIMARY KEY,
 clerk_user_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id),
 party_id TEXT COLLATE "C" NOT NULL,
 candidate_id TEXT COLLATE "C" NOT NULL,
 district_id TEXT COLLATE "C" NOT NULL,
 utc_day TEXT COLLATE "C" NOT NULL,
 request_id TEXT COLLATE "C" NOT NULL UNIQUE,
 complete_request_id TEXT COLLATE "C" UNIQUE,
 capacity_spent BIGINT NOT NULL CHECK(capacity_spent > 0),
 started_at BIGINT NOT NULL,
 completes_at BIGINT NOT NULL,
 completed_at BIGINT,
 points BIGINT CHECK(points IS NULL OR points >= 1),
 CHECK(completes_at > started_at),
 CHECK((completed_at IS NULL AND points IS NULL AND complete_request_id IS NULL) OR (completed_at IS NOT NULL AND points IS NOT NULL AND complete_request_id IS NOT NULL)),
 UNIQUE(clerk_user_id, utc_day)
);
CREATE INDEX IF NOT EXISTS idx_canvass_quests_visibility ON canvass_quests(candidate_id, district_id);
