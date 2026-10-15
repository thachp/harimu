-- Issue #310: additive saved defense window per nation (start hour in UTC; no row = the seed window in code). Existing data is preserved.
CREATE TABLE IF NOT EXISTS war_defense_windows (
 nation_id TEXT COLLATE "C" PRIMARY KEY CHECK(nation_id IN ('kindle','korund','aurelle')),
 start_hour_utc INTEGER NOT NULL CHECK(start_hour_utc BETWEEN 0 AND 23),
 set_by TEXT COLLATE "C" NOT NULL CHECK(length(set_by) BETWEEN 1 AND 60),
 changed_at BIGINT NOT NULL
);
