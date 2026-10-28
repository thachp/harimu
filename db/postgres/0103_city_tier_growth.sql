-- harimu:destructive-reviewed
-- Issue #952: lift world_cities.tier from CHECK(tier = 1) to 1–4. The only DROP is world_cities_tier_check; no row is rewritten.
-- above_next_tier_since stays null until the growth check sets it. Flag HARIMU_CITY_TIER_GROWTH_ENABLED (off in production).
ALTER TABLE world_cities DROP CONSTRAINT IF EXISTS world_cities_tier_check;
ALTER TABLE world_cities ADD CONSTRAINT world_cities_tier_check CHECK (tier BETWEEN 1 AND 4);
ALTER TABLE world_cities ADD COLUMN IF NOT EXISTS above_next_tier_since BIGINT;
