-- harimu:destructive-reviewed
-- #1531: widen moderation_reports.target_kind for citizen-name. Replace the table UNIQUE
-- (reporter_id, target_kind, target_id) with two partial unique indexes so a citizen-name
-- report can be filed again after a rename (keyed on target_snapshot) without loosening
-- uniqueness for other kinds. The only DROPs are the CHECK and that UNIQUE; existing rows
-- still satisfy the new CHECK. idx_moderation_reports_reporter is unchanged. No row is rewritten.
ALTER TABLE moderation_reports DROP CONSTRAINT IF EXISTS moderation_reports_target_kind_check;
ALTER TABLE moderation_reports ADD CONSTRAINT moderation_reports_target_kind_check CHECK(target_kind IN ('citizen-message','notable-reply','ai-leader-address','ai-news','player-article','square-poster','citizen-name'));
ALTER TABLE moderation_reports DROP CONSTRAINT IF EXISTS moderation_reports_reporter_id_target_kind_target_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_moderation_reports_target ON moderation_reports (reporter_id, target_kind, target_id) WHERE target_kind <> 'citizen-name';
CREATE UNIQUE INDEX IF NOT EXISTS idx_moderation_reports_citizen_name ON moderation_reports (reporter_id, target_id, target_snapshot) WHERE target_kind = 'citizen-name';
