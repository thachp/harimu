-- Issue #1516: citizen-to-citizen DM block (docs 21.1 "report/block everywhere"). Rides HARIMU_DM_CHAT_ENABLED (off in production). Additive only.
CREATE TABLE IF NOT EXISTS dm_blocks (blocker_id TEXT NOT NULL REFERENCES citizens(clerk_user_id), blocked_id TEXT NOT NULL REFERENCES citizens(clerk_user_id), blocked_at INTEGER NOT NULL, PRIMARY KEY(blocker_id, blocked_id), CHECK(blocker_id <> blocked_id));
CREATE INDEX IF NOT EXISTS dm_blocks_blocked ON dm_blocks(blocked_id);
