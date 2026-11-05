-- #1089: Hoarvale Moot bills. Assent status and date sit on the bill row. Flag HARIMU_HOARVALE_ASSENT_ENABLED (off in production).
CREATE TABLE IF NOT EXISTS hoarvale_bills (
 bill_id TEXT COLLATE "C" PRIMARY KEY CHECK(length(bill_id) BETWEEN 1 AND 64),
 title TEXT COLLATE "C" NOT NULL CHECK(length(title) BETWEEN 1 AND 80),
 passed_at BIGINT NOT NULL CHECK(passed_at >= 0),
 dissolved_at BIGINT CHECK(dissolved_at IS NULL OR dissolved_at >= passed_at),
 assent_status TEXT COLLATE "C" NOT NULL CHECK(assent_status IN ('pending','assented','withheld')),
 assent_at BIGINT CHECK(assent_at IS NULL OR assent_at >= 0)
);
