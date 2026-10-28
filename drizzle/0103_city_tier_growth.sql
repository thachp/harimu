-- Issue #952: lift world_cities.tier from CHECK(tier = 1) to 1–4 and add above_next_tier_since.
-- SQLite cannot alter a CHECK, so the table is rebuilt (0054 pattern). Rows are copied unchanged; the new column is null.
DROP TABLE IF EXISTS world_cities_tier_old;
ALTER TABLE world_cities RENAME TO world_cities_tier_old;
CREATE TABLE world_cities (
 id TEXT PRIMARY KEY,
 nation_id TEXT NOT NULL CHECK(nation_id IN ('kindle','korund','aurelle')),
 name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 40),
 tier INTEGER NOT NULL DEFAULT 1 CHECK(tier BETWEEN 1 AND 4),
 center_x INTEGER NOT NULL, center_y INTEGER NOT NULL,
 authority TEXT NOT NULL CHECK(authority IN ('kindle-charter','korund-chairman-order','aurelle-royal-charter')),
 founded_by TEXT NOT NULL,
 request_id TEXT NOT NULL UNIQUE,
 founded_at INTEGER NOT NULL,
 above_next_tier_since INTEGER,
 UNIQUE(center_x, center_y)
);
INSERT INTO world_cities (id,nation_id,name,tier,center_x,center_y,authority,founded_by,request_id,founded_at)
 SELECT id,nation_id,name,tier,center_x,center_y,authority,founded_by,request_id,founded_at FROM world_cities_tier_old;
DROP TABLE world_cities_tier_old;
