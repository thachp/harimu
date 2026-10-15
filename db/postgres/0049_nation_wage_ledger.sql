-- harimu:destructive-reviewed
-- Issue #490 (Stage 0d, design #486): generic per-nation wage ledger (additive) and citizen_faith widening. The only DROP is the citizen_faith nation_id CHECK (a literal list of the three live nations), replaced by a foreign key to nations(id); no data is touched. Runtime use is behind HARIMU_NATION_WORK_ENABLED (off).
CREATE TABLE IF NOT EXISTS nation_wage_funds (
 nation_id TEXT COLLATE "C" PRIMARY KEY REFERENCES nations(id),
 initial_minor BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(initial_minor) = 'integer' AND initial_minor >= 0)
);
CREATE TABLE IF NOT EXISTS nation_wage_starts (
 shift_id TEXT COLLATE "C" PRIMARY KEY REFERENCES work_shifts(id),
 nation_id TEXT COLLATE "C" NOT NULL REFERENCES nations(id),
 clerk_user_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id),
 job_id TEXT COLLATE "C" NOT NULL,
 capacity_applied BIGINT NOT NULL DEFAULT 0 CHECK(harimu_compat.sqlite_typeof(capacity_applied) = 'integer' AND capacity_applied IN (0,1))
);
CREATE TABLE IF NOT EXISTS nation_wage_settlements (
 shift_id TEXT COLLATE "C" PRIMARY KEY REFERENCES work_shifts(id),
 nation_id TEXT COLLATE "C" NOT NULL REFERENCES nations(id),
 clerk_user_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id),
 job_id TEXT COLLATE "C" NOT NULL,
 wage_minor BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(wage_minor) = 'integer' AND wage_minor > 0),
 settled_at BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(settled_at) = 'integer')
);
CREATE INDEX IF NOT EXISTS idx_nation_wage_settlements_wallet ON nation_wage_settlements(nation_id, clerk_user_id);
CREATE TABLE IF NOT EXISTS nation_wage_spends (
 id TEXT COLLATE "C" PRIMARY KEY,
 nation_id TEXT COLLATE "C" NOT NULL REFERENCES nations(id),
 clerk_user_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id),
 amount_minor BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(amount_minor) = 'integer' AND amount_minor > 0),
 reason TEXT COLLATE "C" NOT NULL,
 occurred_at BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(occurred_at) = 'integer')
);
CREATE INDEX IF NOT EXISTS idx_nation_wage_spends_wallet ON nation_wage_spends(nation_id, clerk_user_id);
ALTER TABLE citizen_faith DROP CONSTRAINT IF EXISTS citizen_faith_nation_id_check;
ALTER TABLE citizen_faith DROP CONSTRAINT IF EXISTS citizen_faith_nation_id_fkey;
ALTER TABLE citizen_faith DROP CONSTRAINT IF EXISTS citizen_faith_nation_id_nonempty;
ALTER TABLE citizen_faith ADD CONSTRAINT citizen_faith_nation_id_fkey FOREIGN KEY (nation_id) REFERENCES nations(id);
ALTER TABLE citizen_faith ADD CONSTRAINT citizen_faith_nation_id_nonempty CHECK(nation_id <> '');
