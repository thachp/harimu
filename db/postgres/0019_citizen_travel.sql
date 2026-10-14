-- Issue #123: additive citizen travel state (location square + travel timer). Existing data is preserved.
CREATE TABLE IF NOT EXISTS citizen_travel (
 user_id TEXT COLLATE "C" PRIMARY KEY REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 nation_id TEXT COLLATE "C" NOT NULL CHECK(nation_id IN ('kindle','korund','aurelle')),
 from_x INTEGER NOT NULL, from_y INTEGER NOT NULL,
 to_x INTEGER NOT NULL, to_y INTEGER NOT NULL,
 departed_at BIGINT NOT NULL,
 traveling_until BIGINT NOT NULL CHECK(traveling_until >= departed_at),
 request_id TEXT COLLATE "C" NOT NULL UNIQUE
);
