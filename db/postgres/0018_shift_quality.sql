-- Issue #40: additive shift quality snapshot (grade + reward multiplier). Existing shifts are unaffected.
-- Numbered 0018: after dev 0017 (world square purchases); the migrator may skip lower numbers, so no gap filling. 0019 is #214/#195.
CREATE TABLE IF NOT EXISTS shift_quality(shift_id TEXT COLLATE "C" PRIMARY KEY REFERENCES work_shifts(id),grade TEXT COLLATE "C" CHECK(grade IS NULL OR grade IN('poor','fair','good','excellent')),multiplier_pct BIGINT NOT NULL CHECK(multiplier_pct IN(100,110,125,150)),correct BIGINT CHECK(correct IS NULL OR correct BETWEEN 0 AND 3));
