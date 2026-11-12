-- #1324: one row per evacuated citizen (latest capture). Written in the capture batch. No home_city_moves row.
CREATE TABLE IF NOT EXISTS citizen_evacuations (
 user_id TEXT COLLATE "C" PRIMARY KEY REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 capture_id TEXT COLLATE "C" NOT NULL REFERENCES city_captures(id) ON DELETE CASCADE,
 from_name TEXT COLLATE "C" NOT NULL,
 to_name TEXT COLLATE "C" NOT NULL,
 evacuated_at BIGINT NOT NULL
);
