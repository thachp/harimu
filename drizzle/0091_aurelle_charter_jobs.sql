-- Issue #886 (c): Aurelle quarry and foundry charter jobs paid in Crowns from the estate treasury; every payment writes one Crown issuance record (ARC on #886, #885). Flag HARIMU_MVP_JOB_TYPES_ENABLED (off in production). Additive only.
CREATE TABLE IF NOT EXISTS aurelle_charter_settlements (shift_id TEXT PRIMARY KEY REFERENCES work_shifts(id), clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id),
 job_id TEXT NOT NULL, wage_minor INTEGER NOT NULL CHECK(wage_minor > 0), settled_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS crown_issuances (id TEXT PRIMARY KEY, shift_id TEXT NOT NULL UNIQUE REFERENCES aurelle_charter_settlements(shift_id), clerk_user_id TEXT NOT NULL,
 amount_minor INTEGER NOT NULL CHECK(amount_minor > 0), source TEXT NOT NULL CHECK(source IN ('aurelle-charter-wage')), issued_at INTEGER NOT NULL);
