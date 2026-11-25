-- harimu:destructive-reviewed
-- #1462: widen moderation_reports.target_kind for ai-leader-address, ai-news and player-article.
-- The only DROP is moderation_reports_target_kind_check, re-added widened. Existing rows still satisfy it.
-- Unique (reporter_id, target_kind, target_id) and idx_moderation_reports_reporter are unchanged. No row is rewritten.
ALTER TABLE moderation_reports DROP CONSTRAINT IF EXISTS moderation_reports_target_kind_check;
ALTER TABLE moderation_reports ADD CONSTRAINT moderation_reports_target_kind_check CHECK(target_kind IN ('citizen-message','notable-reply','ai-leader-address','ai-news','player-article'));
