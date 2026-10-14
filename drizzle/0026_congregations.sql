-- Issue #224: additive congregations, Officiant seats and service log (feature flag HARIMU_FAITH_ENABLED). Existing data is preserved.
CREATE TABLE IF NOT EXISTS congregation_members (
 user_id TEXT PRIMARY KEY REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 congregation_id TEXT NOT NULL,
 faith_id TEXT NOT NULL CHECK(faith_id IN ('kinward-rite','fair-wind-vow','open-hand')),
 city_id TEXT NOT NULL,
 officiant_opt_in INTEGER NOT NULL DEFAULT 0 CHECK(officiant_opt_in IN (0,1)),
 joined_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_congregation_members_congregation ON congregation_members(congregation_id);
CREATE TABLE IF NOT EXISTS congregation_changes (
 user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 game_day INTEGER NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('join','leave')),
 congregation_id TEXT NOT NULL,
 changed_at INTEGER NOT NULL,
 request_id TEXT NOT NULL UNIQUE,
 PRIMARY KEY(user_id, game_day)
);
CREATE TABLE IF NOT EXISTS congregation_officiants (
 congregation_id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 since_day INTEGER NOT NULL,
 seated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS officiant_service (
 user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 game_day INTEGER NOT NULL,
 faith_id TEXT NOT NULL CHECK(faith_id IN ('kinward-rite','fair-wind-vow','open-hand')),
 congregation_id TEXT NOT NULL,
 served_at INTEGER NOT NULL,
 request_id TEXT NOT NULL UNIQUE,
 PRIMARY KEY(user_id, game_day)
);
