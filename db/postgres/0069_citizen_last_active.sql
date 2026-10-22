-- Issue #739 slice 1: citizen dormancy (docs §17.4). General activity for Away/Dormant/Archived, read and bumped (hourly) by GET /api/citizen only
-- while HARIMU_DORMANCY_ENABLED is "true". Additive: one nullable column, backfilled from updated_at for existing citizens; nothing else changes.
ALTER TABLE citizens ADD COLUMN IF NOT EXISTS last_active_at TEXT COLLATE "C";
UPDATE citizens SET last_active_at = updated_at WHERE last_active_at IS NULL;
