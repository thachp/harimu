-- Issue #490 (Stage 0d, design #486): generic per-nation wage ledger (additive) and citizen_faith widening (table rebuild). Runtime use is behind HARIMU_NATION_WORK_ENABLED (off).
CREATE TABLE IF NOT EXISTS nation_wage_funds (
 nation_id TEXT PRIMARY KEY REFERENCES nations(id),
 initial_minor INTEGER NOT NULL CHECK(initial_minor >= 0)
);
CREATE TABLE IF NOT EXISTS nation_wage_starts (
 shift_id TEXT PRIMARY KEY REFERENCES work_shifts(id),
 nation_id TEXT NOT NULL REFERENCES nations(id),
 clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id),
 job_id TEXT NOT NULL,
 capacity_applied INTEGER NOT NULL DEFAULT 0 CHECK(capacity_applied IN (0,1))
);
CREATE TABLE IF NOT EXISTS nation_wage_settlements (
 shift_id TEXT PRIMARY KEY REFERENCES work_shifts(id),
 nation_id TEXT NOT NULL REFERENCES nations(id),
 clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id),
 job_id TEXT NOT NULL,
 wage_minor INTEGER NOT NULL CHECK(wage_minor > 0),
 settled_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nation_wage_settlements_wallet ON nation_wage_settlements(nation_id, clerk_user_id);
CREATE TABLE IF NOT EXISTS nation_wage_spends (
 id TEXT PRIMARY KEY,
 nation_id TEXT NOT NULL REFERENCES nations(id),
 clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id),
 amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
 reason TEXT NOT NULL,
 occurred_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nation_wage_spends_wallet ON nation_wage_spends(nation_id, clerk_user_id);
-- citizen_faith: SQLite cannot alter a CHECK, so the table is rebuilt. nation_id was limited to the three live nations; it now references nations(id), so a later nation never needs this again.
-- Existing rows are copied unchanged; the hidden-faith CHECK is kept. A leftover citizen_faith_old (an interrupted earlier run) is removed first.
DROP TABLE IF EXISTS citizen_faith_old;
ALTER TABLE citizen_faith RENAME TO citizen_faith_old;
CREATE TABLE citizen_faith (
 user_id TEXT PRIMARY KEY REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 nation_id TEXT NOT NULL REFERENCES nations(id) CHECK(nation_id <> ''),
 faith_id TEXT NOT NULL CHECK(faith_id IN ('unaffiliated','kinward-rite','fair-wind-vow','open-hand')),
 hidden_faith_id TEXT CHECK(hidden_faith_id IS NULL OR (nation_id='korund' AND hidden_faith_id IN ('kinward-rite','fair-wind-vow','open-hand'))),
 chosen_at INTEGER NOT NULL,
 changed_at INTEGER,
 request_id TEXT NOT NULL UNIQUE
);
INSERT INTO citizen_faith (user_id,nation_id,faith_id,hidden_faith_id,chosen_at,changed_at,request_id)
 SELECT user_id,nation_id,faith_id,hidden_faith_id,chosen_at,changed_at,request_id FROM citizen_faith_old;
DROP TABLE citizen_faith_old;
