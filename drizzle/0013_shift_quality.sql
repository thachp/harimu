-- Issue #40: additive shift quality snapshot (grade + reward multiplier). Existing shifts are unaffected.
-- Numbered 0013: 0011 is reserved for #88 (world squares) and 0012 for #95.
CREATE TABLE IF NOT EXISTS shift_quality (shift_id TEXT PRIMARY KEY REFERENCES work_shifts(id),grade TEXT CHECK(grade IS NULL OR grade IN ('poor','fair','good','excellent')),multiplier_pct INTEGER NOT NULL CHECK(multiplier_pct IN (100,110,125,150)),correct INTEGER CHECK(correct IS NULL OR correct BETWEEN 0 AND 3));
