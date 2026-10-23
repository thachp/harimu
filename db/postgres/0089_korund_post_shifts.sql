-- Issue #886 (b): Korund Labor Bureau posts as playable shifts paid in Labor Notes from the state pool; every payment writes one Labor Note issuance record (ARC on #886, #885). Flag HARIMU_MVP_JOB_TYPES_ENABLED (off in production). Additive only.
CREATE TABLE IF NOT EXISTS korund_post_settlements (
 shift_id TEXT COLLATE "C" PRIMARY KEY REFERENCES work_shifts(id),
 clerk_user_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id),
 job_id TEXT COLLATE "C" NOT NULL,
 wage_minor BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(wage_minor) = 'integer' AND wage_minor > 0),
 settled_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS labor_note_issuances (
 id TEXT COLLATE "C" PRIMARY KEY,
 shift_id TEXT COLLATE "C" NOT NULL UNIQUE REFERENCES korund_post_settlements(shift_id),
 clerk_user_id TEXT COLLATE "C" NOT NULL,
 amount_minor BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(amount_minor) = 'integer' AND amount_minor > 0),
 source TEXT COLLATE "C" NOT NULL CHECK(source IN ('korund-post-wage')),
 issued_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_labor_note_issuances_issued ON labor_note_issuances(issued_at);
