-- Issue #886 (b): Korund Labor Bureau posts as playable shifts paid in Labor Notes from the state pool; every payment writes one Labor Note issuance record (ARC on #886, #885). Flag HARIMU_MVP_JOB_TYPES_ENABLED (off in production). Additive only.
CREATE TABLE IF NOT EXISTS korund_post_settlements (shift_id TEXT PRIMARY KEY REFERENCES work_shifts(id), clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id),
 job_id TEXT NOT NULL, wage_minor INTEGER NOT NULL CHECK(wage_minor > 0), settled_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS labor_note_issuances (id TEXT PRIMARY KEY, shift_id TEXT NOT NULL UNIQUE REFERENCES korund_post_settlements(shift_id), clerk_user_id TEXT NOT NULL,
 amount_minor INTEGER NOT NULL CHECK(amount_minor > 0), source TEXT NOT NULL CHECK(source IN ('korund-post-wage')), issued_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_labor_note_issuances_issued ON labor_note_issuances(issued_at);
