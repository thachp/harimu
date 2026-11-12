-- Issue #465: Spark origin on each ledger row (earned / purchased / unknown). Missing rows stay unknown. Additive.
CREATE TABLE IF NOT EXISTS spark_origin_entries (
 id TEXT COLLATE "C" PRIMARY KEY,
 clerk_user_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 origin TEXT COLLATE "C" NOT NULL CHECK(origin IN ('earned','purchased','unknown')),
 delta_minor BIGINT NOT NULL CHECK(delta_minor <> 0),
 reason TEXT COLLATE "C" NOT NULL,
 source_id TEXT COLLATE "C" NOT NULL,
 occurred_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_spark_origin_entries_citizen ON spark_origin_entries(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_spark_origin_entries_source ON spark_origin_entries(source_id);
