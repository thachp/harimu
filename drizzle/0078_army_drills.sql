-- Issue #738 slice 2: army drills (docs §15.3): one drill per member per game day raises unit strength and morale, flag HARIMU_ARMY_DRILLS_ENABLED (off in production). Additive only.
CREATE TABLE IF NOT EXISTS army_drills (request_id TEXT PRIMARY KEY, clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE, unit_id TEXT NOT NULL, game_day INTEGER NOT NULL, drilled_at INTEGER NOT NULL, UNIQUE(clerk_user_id, game_day));
CREATE INDEX IF NOT EXISTS idx_army_drills_unit_day ON army_drills(unit_id, game_day);
