-- Issue #124: additive T1 city records founded on Wildlands. Existing data is preserved.
CREATE TABLE IF NOT EXISTS world_cities (
 id TEXT PRIMARY KEY,
 nation_id TEXT NOT NULL CHECK(nation_id IN ('kindle','korund','aurelle')),
 name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 40),
 tier INTEGER NOT NULL DEFAULT 1 CHECK(tier = 1),
 center_x INTEGER NOT NULL, center_y INTEGER NOT NULL,
 authority TEXT NOT NULL CHECK(authority IN ('kindle-charter','korund-chairman-order','aurelle-royal-charter')),
 founded_by TEXT NOT NULL,
 request_id TEXT NOT NULL UNIQUE,
 founded_at INTEGER NOT NULL,
 UNIQUE(center_x, center_y)
);
