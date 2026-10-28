-- Issue #882: embassy chat between two live nations (docs §27). Flag HARIMU_EMBASSY_CHAT_ENABLED (off in production). Additive only.
CREATE TABLE IF NOT EXISTS embassy_chat_messages (id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id), nation_id TEXT NOT NULL, body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 280), posted_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS embassy_chat_messages_feed ON embassy_chat_messages(channel_id, posted_at);
CREATE INDEX IF NOT EXISTS embassy_chat_messages_rate ON embassy_chat_messages(user_id, posted_at);
