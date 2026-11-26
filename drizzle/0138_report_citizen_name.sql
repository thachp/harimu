-- #1531: widen moderation_reports.target_kind for citizen-name and replace the
-- table UNIQUE (reporter_id, target_kind, target_id) with two partial unique indexes.
-- Other kinds stay unique on (reporter, kind, target). citizen-name is unique on
-- (reporter, target, target_snapshot) so a rename can be reported again. SQLite cannot
-- alter a CHECK or a table UNIQUE, so the table is rebuilt (0135 pattern). Every existing
-- row and id is copied. idx_moderation_reports_reporter is recreated.
DROP TABLE IF EXISTS moderation_reports_kind_old;
ALTER TABLE moderation_reports RENAME TO moderation_reports_kind_old;
DROP INDEX IF EXISTS idx_moderation_reports_reporter;
CREATE TABLE moderation_reports (
 id TEXT PRIMARY KEY,
 request_id TEXT NOT NULL UNIQUE,
 reporter_id TEXT NOT NULL,
 target_kind TEXT NOT NULL CHECK(target_kind IN ('citizen-message','notable-reply','ai-leader-address','ai-news','player-article','square-poster','citizen-name')),
 target_id TEXT NOT NULL CHECK(length(target_id) BETWEEN 1 AND 80),
 reason_id TEXT NOT NULL CHECK(length(reason_id) BETWEEN 1 AND 40),
 note TEXT CHECK(note IS NULL OR length(note)<=280),
 created_at INTEGER NOT NULL,
 target_snapshot TEXT CHECK(target_snapshot IS NULL OR length(target_snapshot)<=280)
);
INSERT INTO moderation_reports (id,request_id,reporter_id,target_kind,target_id,reason_id,note,created_at,target_snapshot)
 SELECT id,request_id,reporter_id,target_kind,target_id,reason_id,note,created_at,target_snapshot FROM moderation_reports_kind_old;
DROP TABLE moderation_reports_kind_old;
CREATE INDEX IF NOT EXISTS idx_moderation_reports_reporter ON moderation_reports(reporter_id,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_moderation_reports_target ON moderation_reports(reporter_id,target_kind,target_id) WHERE target_kind <> 'citizen-name';
CREATE UNIQUE INDEX IF NOT EXISTS idx_moderation_reports_citizen_name ON moderation_reports(reporter_id,target_id,target_snapshot) WHERE target_kind = 'citizen-name';
