-- Issue #599 (Diplomatic Hall PoC, slice 1): one cross-nation channel for Kindle and Aurelle citizens. Additive: one new table and two indexes, existing data untouched.
-- Written and read only by app/api/diplomatic-hall behind HARIMU_DIPLOMATIC_HALL_ENABLED (default "false"). nation_id is the poster's nation when the post was written.
CREATE TABLE IF NOT EXISTS diplomatic_hall_messages (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id),
 nation_id TEXT NOT NULL CHECK(nation_id IN ('kindle','aurelle')),
 body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 280),
 posted_at INTEGER NOT NULL,
 deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1))
);
CREATE INDEX IF NOT EXISTS diplomatic_hall_messages_recent ON diplomatic_hall_messages(posted_at);
CREATE INDEX IF NOT EXISTS diplomatic_hall_messages_rate ON diplomatic_hall_messages(user_id, posted_at);
