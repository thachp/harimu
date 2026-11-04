-- Issue #1053: quartermaster shifts (docs §15.3 Logistics): one shift per unit member per game day adds a supply square (cap +3), flag HARIMU_ARMY_QUARTERMASTER_ENABLED (off in production). Additive only.
CREATE TABLE IF NOT EXISTS army_quartermaster_shifts (request_id TEXT PRIMARY KEY, clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE, unit_id TEXT NOT NULL, game_day INTEGER NOT NULL, shifted_at INTEGER NOT NULL, UNIQUE(clerk_user_id, game_day));
CREATE INDEX IF NOT EXISTS idx_army_qm_unit_at ON army_quartermaster_shifts(unit_id, shifted_at);
