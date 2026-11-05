-- #1089: Hoarvale Moot bills. Assent status and date sit on the bill row. Flag HARIMU_HOARVALE_ASSENT_ENABLED (off in production).
CREATE TABLE IF NOT EXISTS hoarvale_bills (
  bill_id TEXT PRIMARY KEY CHECK(length(bill_id) BETWEEN 1 AND 64),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 80),
  passed_at INTEGER NOT NULL CHECK(passed_at >= 0),
  dissolved_at INTEGER CHECK(dissolved_at IS NULL OR dissolved_at >= passed_at),
  assent_status TEXT NOT NULL CHECK(assent_status IN ('pending','assented','withheld')),
  assent_at INTEGER CHECK(assent_at IS NULL OR assent_at >= 0)
);
