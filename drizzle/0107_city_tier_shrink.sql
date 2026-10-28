-- Issue #966: shortage clock and the capital's starting tier. Additive columns on the #952 table.
ALTER TABLE world_cities ADD COLUMN below_need_since INTEGER;
ALTER TABLE world_cities ADD COLUMN tier_floor INTEGER NOT NULL DEFAULT 1;
