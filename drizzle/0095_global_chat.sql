-- Issue #881 (part 2): global chat channel for every enrolled citizen (docs 27). Flag HARIMU_GLOBAL_CHAT_ENABLED (off in production). Additive only.
CREATE TABLE IF NOT EXISTS global_chat_messages (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id), nation_id TEXT NOT NULL, body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 280), posted_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS global_chat_messages_feed ON global_chat_messages(posted_at);
CREATE INDEX IF NOT EXISTS global_chat_messages_rate ON global_chat_messages(user_id, posted_at);
