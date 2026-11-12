-- Issue #465: Spark origin on each ledger row (earned / purchased / unknown). Missing rows stay unknown. Additive.
CREATE TABLE IF NOT EXISTS spark_origin_entries (
 id TEXT PRIMARY KEY,
 clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 origin TEXT NOT NULL CHECK(origin IN ('earned','purchased','unknown')),
 delta_minor INTEGER NOT NULL CHECK(delta_minor <> 0),
 reason TEXT NOT NULL,
 source_id TEXT NOT NULL,
 occurred_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_spark_origin_entries_citizen ON spark_origin_entries(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_spark_origin_entries_source ON spark_origin_entries(source_id);
