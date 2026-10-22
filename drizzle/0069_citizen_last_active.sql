-- Issue #739 slice 1: citizen dormancy (docs §17.4). One nullable column, backfilled from updated_at; flag HARIMU_DORMANCY_ENABLED.
ALTER TABLE citizens ADD COLUMN last_active_at TEXT;
UPDATE citizens SET last_active_at = updated_at WHERE last_active_at IS NULL;
