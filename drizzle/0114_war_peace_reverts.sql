-- Issue #1054: one row per war whose treaty returned unceded captures. Flag HARIMU_WAR_PEACE_REVERT_ENABLED (off in production). Additive only. Number 0114: 0112 is claimed by open PRs #1068 and #1071, and 0113 by #1059.
CREATE TABLE IF NOT EXISTS war_peace_reverts (
 war_id TEXT PRIMARY KEY REFERENCES wars(id) ON DELETE CASCADE,
 status TEXT NOT NULL CHECK(status IN ('pending','done')),
 squares INTEGER CHECK((status='pending')=(squares IS NULL)),
 reverted_at INTEGER NOT NULL
);
