-- #1047: the daily soft-cap count reads one citizen's shifts by started_at. Additive: an index only, no table change.
CREATE INDEX IF NOT EXISTS idx_work_shifts_user_started ON work_shifts(clerk_user_id, started_at);
