-- Issue #753 slice 1: AI review queue (docs §21.4 Human review). Flagged AI outputs plus a ~1% sample of passing public outputs, flag HARIMU_AI_REVIEW_QUEUE_ENABLED (off in production). One additive table; nothing existing is changed.
CREATE TABLE IF NOT EXISTS ai_review_queue (
 id TEXT PRIMARY KEY,
 created_at INTEGER NOT NULL,
 source TEXT NOT NULL CHECK(length(source) BETWEEN 1 AND 40),
 nation_id TEXT NOT NULL CHECK(nation_id IN ('kindle','korund','aurelle')),
 persona TEXT NOT NULL CHECK(length(persona) BETWEEN 1 AND 80),
 output_text TEXT NOT NULL CHECK(length(output_text)<=4000),
 filter_result TEXT NOT NULL CHECK(filter_result IN ('passed','regenerated','replaced')),
 filter_detail TEXT CHECK(filter_detail IS NULL OR length(filter_detail)<=40),
 reason TEXT NOT NULL CHECK(reason IN ('flagged','sample')),
 reviewed_at INTEGER,
 reviewer_note TEXT CHECK(reviewer_note IS NULL OR length(reviewer_note)<=500)
);
CREATE INDEX IF NOT EXISTS idx_ai_review_queue_created ON ai_review_queue(created_at);
