-- Issue #362: additive Aurelle Crown decree records (debasement PoC). Existing data is preserved.
CREATE TABLE IF NOT EXISTS crown_decrees (
 id TEXT PRIMARY KEY,
 request_id TEXT NOT NULL UNIQUE,
 game_year INTEGER NOT NULL CHECK(game_year >= 1),
 percent_bp INTEGER NOT NULL CHECK(percent_bp BETWEEN 1 AND 1500),
 parity_before INTEGER NOT NULL CHECK(parity_before > 0),
 parity_after INTEGER NOT NULL CHECK(parity_after > parity_before),
 confidence_before INTEGER NOT NULL CHECK(confidence_before BETWEEN 0 AND 100),
 confidence_after INTEGER NOT NULL CHECK(confidence_after BETWEEN 0 AND 100),
 decreed_by TEXT NOT NULL CHECK(length(decreed_by) BETWEEN 1 AND 60),
 decreed_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crown_decrees_one_per_year ON crown_decrees(game_year);
