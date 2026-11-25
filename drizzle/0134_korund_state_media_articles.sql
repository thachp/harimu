-- #1469: Korund State Media writers (docs §18.2). Flag HARIMU_KORUND_STATE_MEDIA_WRITERS_ENABLED (GRAY 95; off in production). Additive only.
-- 0133 is SDE1's #1468 and may land first. Safe after 0132.
CREATE TABLE IF NOT EXISTS korund_state_media_articles (id TEXT PRIMARY KEY, author_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id), entry_id TEXT NOT NULL, published_at INTEGER NOT NULL, request_id TEXT NOT NULL UNIQUE, approval_status TEXT NOT NULL, approver TEXT NOT NULL, approval_rule_id TEXT NOT NULL);
