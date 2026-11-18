-- #1462: widen moderation_reports.target_kind for ai-leader-address, ai-news and player-article.
-- SQLite cannot alter a CHECK, so the table is rebuilt (0121 pattern). Every existing row and id is copied.
-- Unique (reporter_id, target_kind, target_id), request_id UNIQUE and idx_moderation_reports_reporter are recreated.
DROP TABLE IF EXISTS moderation_reports_kind_old;
ALTER TABLE moderation_reports RENAME TO moderation_reports_kind_old;
DROP INDEX IF EXISTS idx_moderation_reports_reporter;
CREATE TABLE moderation_reports (
 id TEXT PRIMARY KEY,
 request_id TEXT NOT NULL UNIQUE,
 reporter_id TEXT NOT NULL,
 target_kind TEXT NOT NULL CHECK(target_kind IN ('citizen-message','notable-reply','ai-leader-address','ai-news','player-article')),
 target_id TEXT NOT NULL CHECK(length(target_id) BETWEEN 1 AND 80),
 reason_id TEXT NOT NULL CHECK(length(reason_id) BETWEEN 1 AND 40),
 note TEXT CHECK(note IS NULL OR length(note)<=280),
 created_at INTEGER NOT NULL,
 UNIQUE(reporter_id,target_kind,target_id)
);
INSERT INTO moderation_reports (id,request_id,reporter_id,target_kind,target_id,reason_id,note,created_at)
 SELECT id,request_id,reporter_id,target_kind,target_id,reason_id,note,created_at FROM moderation_reports_kind_old;
DROP TABLE moderation_reports_kind_old;
CREATE INDEX IF NOT EXISTS idx_moderation_reports_reporter ON moderation_reports(reporter_id,created_at);
