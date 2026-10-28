-- Issue #933: partial siege capture up to the weekly frontier-loss cap. Drop UNIQUE(siege_id) on city_captures so each assault step can record its own row; request_id stays unique. Flag HARIMU_WAR_LOSS_CAP_ENABLED.
-- harimu:destructive-reviewed
ALTER TABLE city_captures DROP CONSTRAINT IF EXISTS city_captures_siege_id_key;
CREATE INDEX IF NOT EXISTS idx_city_captures_siege ON city_captures(siege_id);
