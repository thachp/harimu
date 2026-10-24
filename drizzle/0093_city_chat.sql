-- Issue #881 (part 1): city chat channel, one per city (docs 27). Flag HARIMU_CITY_CHAT_ENABLED (off in production). Additive only.
CREATE TABLE IF NOT EXISTS city_chat_messages (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id), nation_id TEXT NOT NULL, city_id TEXT NOT NULL, body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 280), posted_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS city_chat_messages_scope ON city_chat_messages(nation_id, city_id, posted_at);
CREATE INDEX IF NOT EXISTS city_chat_messages_rate ON city_chat_messages(user_id, posted_at);
