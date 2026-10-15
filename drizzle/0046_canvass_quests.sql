-- Issue #442: additive Kindle canvassing quest records (display-only district visibility). Existing data is preserved.
CREATE TABLE IF NOT EXISTS canvass_quests (
 id TEXT PRIMARY KEY,
 clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id),
 party_id TEXT NOT NULL,
 candidate_id TEXT NOT NULL,
 district_id TEXT NOT NULL,
 utc_day TEXT NOT NULL,
 request_id TEXT NOT NULL UNIQUE,
 complete_request_id TEXT UNIQUE,
 capacity_spent INTEGER NOT NULL CHECK(capacity_spent > 0),
 started_at INTEGER NOT NULL,
 completes_at INTEGER NOT NULL,
 completed_at INTEGER,
 points INTEGER CHECK(points IS NULL OR points >= 1),
 CHECK(completes_at > started_at),
 CHECK((completed_at IS NULL AND points IS NULL AND complete_request_id IS NULL) OR (completed_at IS NOT NULL AND points IS NOT NULL AND complete_request_id IS NOT NULL)),
 UNIQUE(clerk_user_id, utc_day)
);
CREATE INDEX IF NOT EXISTS idx_canvass_quests_visibility ON canvass_quests(candidate_id, district_id);
