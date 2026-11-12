-- Issue #1353: party channel, one per Kindle party (docs 18.1). Flag HARIMU_PARTY_CHAT_ENABLED (off in production). Additive only.
CREATE TABLE IF NOT EXISTS party_messages (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id), party_id TEXT NOT NULL, body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 280), posted_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS party_messages_feed ON party_messages(party_id, posted_at);
CREATE INDEX IF NOT EXISTS party_messages_rate ON party_messages(user_id, posted_at);
