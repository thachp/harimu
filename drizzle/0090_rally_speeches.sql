-- Issue #876: model-written Kindle rally speeches (docs 9.4). One stored speech per rally, written only by the scheduled Worker. Flag HARIMU_AI_RALLY_SPEECHES_ENABLED (off in production). Additive only.
CREATE TABLE IF NOT EXISTS rally_speeches (rally_id TEXT PRIMARY KEY, speech TEXT NOT NULL CHECK(length(speech) BETWEEN 1 AND 600), created_at INTEGER NOT NULL);
