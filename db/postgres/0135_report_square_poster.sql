-- harimu:destructive-reviewed
-- #1503: widen moderation_reports.target_kind for square-poster and add target_snapshot.
-- The only DROP is moderation_reports_target_kind_check, re-added widened. Existing rows still satisfy it.
-- Unique (reporter_id, target_kind, target_id) and idx_moderation_reports_reporter are unchanged. No row is rewritten.
ALTER TABLE moderation_reports DROP CONSTRAINT IF EXISTS moderation_reports_target_kind_check;
ALTER TABLE moderation_reports ADD CONSTRAINT moderation_reports_target_kind_check CHECK(target_kind IN ('citizen-message','notable-reply','ai-leader-address','ai-news','player-article','square-poster'));
ALTER TABLE moderation_reports ADD COLUMN IF NOT EXISTS target_snapshot TEXT CHECK(target_snapshot IS NULL OR length(target_snapshot)<=280);
