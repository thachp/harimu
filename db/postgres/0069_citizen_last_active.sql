-- Issue #739 slice 1: citizen dormancy (docs §17.4). General activity for Away/Dormant/Archived, written (at most hourly) only by POST /api/citizen/heartbeat (GET /api/citizen never touches it, #205)
-- while HARIMU_DORMANCY_ENABLED is "true". Additive: one nullable column, backfilled with the migration time (not updated_at, so active players get no false Welcome back) for existing citizens; nothing else changes.
ALTER TABLE citizens ADD COLUMN IF NOT EXISTS last_active_at TEXT COLLATE "C";
UPDATE citizens SET last_active_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') WHERE last_active_at IS NULL;
