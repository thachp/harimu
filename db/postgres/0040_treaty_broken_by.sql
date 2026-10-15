-- Issue #400: record which signatory broke a treaty (additive column; existing rows read as NULL).
ALTER TABLE treaties ADD COLUMN IF NOT EXISTS broken_by TEXT COLLATE "C" CHECK(broken_by IS NULL OR broken_by IN ('kindle','korund','aurelle'));
