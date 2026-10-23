-- Issue #886 (c): Aurelle quarry and foundry charter jobs paid in Crowns from the estate treasury; every payment writes one Crown issuance record (ARC on #886, #885). Flag HARIMU_MVP_JOB_TYPES_ENABLED (off in production). Additive only.
CREATE TABLE IF NOT EXISTS aurelle_charter_settlements (
 shift_id TEXT COLLATE "C" PRIMARY KEY REFERENCES work_shifts(id),
 clerk_user_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id),
 job_id TEXT COLLATE "C" NOT NULL,
 wage_minor BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(wage_minor) = 'integer' AND wage_minor > 0),
 settled_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS crown_issuances (
 id TEXT COLLATE "C" PRIMARY KEY,
 shift_id TEXT COLLATE "C" NOT NULL UNIQUE REFERENCES aurelle_charter_settlements(shift_id),
 clerk_user_id TEXT COLLATE "C" NOT NULL,
 amount_minor BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(amount_minor) = 'integer' AND amount_minor > 0),
 source TEXT COLLATE "C" NOT NULL CHECK(source IN ('aurelle-charter-wage')),
 issued_at BIGINT NOT NULL
);
