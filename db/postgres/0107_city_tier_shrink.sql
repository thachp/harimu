-- Issue #966: shortage clock and the capital's starting tier. Additive. 0104=#961, 0105=#963, 0106=#964 are open; this is 0107.
-- below_need_since stays null until the shrink check sets it. tier_floor defaults to 1 (founded cities). Flag HARIMU_CITY_TIER_GROWTH_ENABLED (off in production).
ALTER TABLE world_cities ADD COLUMN IF NOT EXISTS below_need_since BIGINT;
ALTER TABLE world_cities ADD COLUMN IF NOT EXISTS tier_floor INTEGER NOT NULL DEFAULT 1;
