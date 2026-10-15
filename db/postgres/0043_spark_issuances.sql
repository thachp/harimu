-- Issue #431: additive Spark issuance records (Kindle money supply PoC). Existing data is preserved.
CREATE TABLE IF NOT EXISTS spark_issuances (
 id TEXT COLLATE "C" PRIMARY KEY,
 request_id TEXT COLLATE "C" NOT NULL UNIQUE,
 game_month BIGINT NOT NULL CHECK(game_month >= 1),
 route TEXT COLLATE "C" NOT NULL CHECK(route IN ('seed','normal','emergency')),
 basis_points BIGINT NOT NULL CHECK(basis_points BETWEEN 0 AND 1000),
 amount_minor BIGINT NOT NULL CHECK(amount_minor >= 0),
 supply_before_minor BIGINT NOT NULL CHECK(supply_before_minor >= 0),
 supply_after_minor BIGINT NOT NULL CHECK(supply_after_minor = supply_before_minor + amount_minor),
 issued_by TEXT COLLATE "C" NOT NULL CHECK(length(issued_by) BETWEEN 1 AND 60),
 issued_at BIGINT NOT NULL,
 prev_id TEXT COLLATE "C" REFERENCES spark_issuances(id),
 CHECK((route = 'seed' AND prev_id IS NULL) OR (route <> 'seed' AND prev_id IS NOT NULL)),
 CHECK(route <> 'seed' OR (id = 'spark-seed' AND basis_points = 0 AND supply_before_minor = 0)),
 CHECK(route <> 'normal' OR basis_points <= 300),
 CHECK(route <> 'emergency' OR basis_points >= 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_spark_issuances_one_successor ON spark_issuances(prev_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_spark_issuances_one_normal_per_month ON spark_issuances(game_month) WHERE route = 'normal';
CREATE INDEX IF NOT EXISTS idx_spark_issuances_month ON spark_issuances(game_month);
