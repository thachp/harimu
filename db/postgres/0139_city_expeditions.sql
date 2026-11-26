-- Issue #1537: city founding expeditions travel and claim on arrival (docs §15.1). Rides HARIMU_CITY_EXPEDITION_TRAVEL_ENABLED (off in production). Additive only.
CREATE TABLE IF NOT EXISTS city_expeditions (
  id TEXT PRIMARY KEY,
  nation_id TEXT NOT NULL CHECK(nation_id IN ('kindle','korund','aurelle')),
  site_x INTEGER NOT NULL,
  site_y INTEGER NOT NULL,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 40),
  authority TEXT NOT NULL CHECK(authority IN ('kindle-charter','korund-chairman-order','aurelle-royal-charter')),
  founded_by TEXT NOT NULL,
  request_id TEXT NOT NULL UNIQUE,
  departs_at INTEGER NOT NULL,
  arrives_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('en_route','founded','failed')),
  failure_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_city_expeditions_one_en_route ON city_expeditions(nation_id) WHERE status = 'en_route';
