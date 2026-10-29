-- Issue #1054: one row per war whose treaty returned unceded captures. Flag HARIMU_WAR_PEACE_REVERT_ENABLED (off in production). Additive only.
CREATE TABLE IF NOT EXISTS war_peace_reverts (
 war_id TEXT PRIMARY KEY REFERENCES wars(id) ON DELETE CASCADE,
 squares INTEGER NOT NULL CHECK(squares >= 0),
 reverted_at INTEGER NOT NULL
);
