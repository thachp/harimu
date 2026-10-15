-- Issue #432: additive daily ledger reconciliation reports (one immutable row per game day). Existing data is preserved.
CREATE TABLE IF NOT EXISTS reconciliation_reports (
 id TEXT COLLATE "C" PRIMARY KEY,
 game_day BIGINT NOT NULL UNIQUE CHECK(game_day >= 1),
 run_id TEXT COLLATE "C" NOT NULL,
 reconciled_at BIGINT NOT NULL,
 mismatch_count BIGINT NOT NULL CHECK(mismatch_count >= 0),
 totals_json TEXT COLLATE "C" NOT NULL,
 first_mismatches_json TEXT COLLATE "C" NOT NULL
);
