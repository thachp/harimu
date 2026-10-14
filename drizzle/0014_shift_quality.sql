-- Issue #40: additive shift quality snapshot (grade + reward multiplier). Existing shifts are unaffected.
-- Numbered 0014: 0011 #88 world squares, 0012 #95 nation stability, 0013 #192 first-week goals.
CREATE TABLE IF NOT EXISTS shift_quality (shift_id TEXT PRIMARY KEY REFERENCES work_shifts(id),grade TEXT CHECK(grade IS NULL OR grade IN ('poor','fair','good','excellent')),multiplier_pct INTEGER NOT NULL CHECK(multiplier_pct IN (100,110,125,150)),correct INTEGER CHECK(correct IS NULL OR correct BETWEEN 0 AND 3));
