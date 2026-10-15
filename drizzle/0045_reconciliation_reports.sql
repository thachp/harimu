-- Issue #432: additive daily ledger reconciliation reports (one immutable row per game day). Existing data is preserved.
CREATE TABLE IF NOT EXISTS reconciliation_reports (
 id TEXT PRIMARY KEY,
 game_day INTEGER NOT NULL UNIQUE CHECK(game_day >= 1),
 run_id TEXT NOT NULL,
 reconciled_at INTEGER NOT NULL,
 mismatch_count INTEGER NOT NULL CHECK(mismatch_count >= 0),
 totals_json TEXT NOT NULL,
 first_mismatches_json TEXT NOT NULL
);
