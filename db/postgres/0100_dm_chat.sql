-- Issue #881 (part 3): direct-message chat between enrolled citizens (docs 27). Flag HARIMU_DM_CHAT_ENABLED (off in production). Additive only.
CREATE TABLE IF NOT EXISTS dm_chat_messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, sender_id TEXT NOT NULL REFERENCES citizens(clerk_user_id), peer_id TEXT NOT NULL REFERENCES citizens(clerk_user_id), body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 280), posted_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS dm_chat_messages_feed ON dm_chat_messages(conversation_id, posted_at);
CREATE INDEX IF NOT EXISTS dm_chat_messages_rate ON dm_chat_messages(sender_id, posted_at);
