-- Issue #957: brigade LN wages and Aurelle food-estate wages write issuance ledger rows (#954 gap).
-- Widen source CHECK and point shift_id at work_shifts (both settlement tables already reference it). SQLite cannot alter a CHECK/FK, so both tables are rebuilt (same pattern as 0054/0102); rows are copied unchanged. Then backfill any settlement that still lacks an issuance row.
DROP TABLE IF EXISTS labor_note_issuances_old;
ALTER TABLE labor_note_issuances RENAME TO labor_note_issuances_old;
CREATE TABLE labor_note_issuances (
 id TEXT PRIMARY KEY,
 shift_id TEXT NOT NULL UNIQUE REFERENCES work_shifts(id),
 clerk_user_id TEXT NOT NULL,
 amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
 source TEXT NOT NULL CHECK(source IN ('korund-post-wage','korund-brigade-wage')),
 issued_at INTEGER NOT NULL
);
INSERT INTO labor_note_issuances (id,shift_id,clerk_user_id,amount_minor,source,issued_at)
 SELECT id,shift_id,clerk_user_id,amount_minor,source,issued_at FROM labor_note_issuances_old;
DROP TABLE labor_note_issuances_old;
INSERT OR IGNORE INTO labor_note_issuances (id,shift_id,clerk_user_id,amount_minor,source,issued_at)
 SELECT 'ln-wage:'||shift_id,shift_id,clerk_user_id,wage_minor,'korund-brigade-wage',settled_at FROM korund_settlements;
CREATE INDEX IF NOT EXISTS idx_labor_note_issuances_issued ON labor_note_issuances(issued_at);

DROP TABLE IF EXISTS crown_issuances_old;
ALTER TABLE crown_issuances RENAME TO crown_issuances_old;
CREATE TABLE crown_issuances (
 id TEXT PRIMARY KEY,
 shift_id TEXT NOT NULL UNIQUE REFERENCES work_shifts(id),
 clerk_user_id TEXT NOT NULL,
 amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
 source TEXT NOT NULL CHECK(source IN ('aurelle-charter-wage','aurelle-food-estate-wage')),
 issued_at INTEGER NOT NULL
);
INSERT INTO crown_issuances (id,shift_id,clerk_user_id,amount_minor,source,issued_at)
 SELECT id,shift_id,clerk_user_id,amount_minor,source,issued_at FROM crown_issuances_old;
DROP TABLE crown_issuances_old;
INSERT OR IGNORE INTO crown_issuances (id,shift_id,clerk_user_id,amount_minor,source,issued_at)
 SELECT 'crn-wage:'||shift_id,shift_id,clerk_user_id,wage_minor,'aurelle-food-estate-wage',settled_at FROM aurelle_settlements;
CREATE INDEX IF NOT EXISTS idx_crown_issuances_issued ON crown_issuances(issued_at);
