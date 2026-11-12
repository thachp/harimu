-- Issue #1342: congregation channel, one per joinable congregation (docs 14.4, 18.1). Flag HARIMU_CONGREGATION_CHAT_ENABLED (off in production). Additive only.
CREATE TABLE IF NOT EXISTS congregation_messages (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id), congregation_id TEXT NOT NULL, body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 280), posted_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS congregation_messages_feed ON congregation_messages(congregation_id, posted_at);
CREATE INDEX IF NOT EXISTS congregation_messages_rate ON congregation_messages(user_id, posted_at);
