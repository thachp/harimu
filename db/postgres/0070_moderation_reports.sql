-- Issue #743 slice 1: out-of-character moderation reports (docs moderation-safety §21.3) for city chat messages and Notable replies, flag HARIMU_REPORTS_ENABLED (off in production). One additive table; nothing existing is changed.
CREATE TABLE IF NOT EXISTS moderation_reports (
 id TEXT COLLATE "C" PRIMARY KEY,
 request_id TEXT COLLATE "C" NOT NULL UNIQUE,
 reporter_id TEXT COLLATE "C" NOT NULL,
 target_kind TEXT COLLATE "C" NOT NULL CHECK(target_kind IN ('citizen-message','notable-reply')),
 target_id TEXT COLLATE "C" NOT NULL CHECK(length(target_id) BETWEEN 1 AND 80),
 reason_id TEXT COLLATE "C" NOT NULL CHECK(length(reason_id) BETWEEN 1 AND 40),
 note TEXT COLLATE "C" CHECK(note IS NULL OR length(note)<=280),
 created_at BIGINT NOT NULL,
 UNIQUE(reporter_id,target_kind,target_id)
);
CREATE INDEX IF NOT EXISTS idx_moderation_reports_reporter ON moderation_reports(reporter_id,created_at);
