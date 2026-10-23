-- Issue #739 slice 1: citizen dormancy (docs §17.4). One nullable column, backfilled with the migration time (not updated_at, so active players get no false Welcome back); flag HARIMU_DORMANCY_ENABLED.
ALTER TABLE citizens ADD COLUMN last_active_at TEXT;
UPDATE citizens SET last_active_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE last_active_at IS NULL;
