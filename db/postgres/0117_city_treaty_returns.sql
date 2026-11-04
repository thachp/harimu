-- Issue #1078: one row per city capture whose squares a treaty returned. Flag HARIMU_WAR_PEACE_REVERT_ENABLED (off in production). Additive only. Number 0117: 0114 is #1054 on dev, 0115 is open PR #1071, and 0116 is open PR #1068.
CREATE TABLE IF NOT EXISTS city_treaty_returns (
 capture_id TEXT COLLATE "C" PRIMARY KEY REFERENCES city_captures(id) ON DELETE CASCADE,
 war_id TEXT COLLATE "C" NOT NULL REFERENCES wars(id) ON DELETE CASCADE,
 city_key TEXT COLLATE "C" NOT NULL,
 returned_to TEXT COLLATE "C" NOT NULL REFERENCES nations(id),
 returned_at BIGINT NOT NULL
);
