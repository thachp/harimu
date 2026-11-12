-- #1341: one poster per purchased square. Replace updates the row; remove deletes it. Commands keep the request id.
CREATE TABLE IF NOT EXISTS square_posters (
 x INTEGER NOT NULL, y INTEGER NOT NULL,
 clerk_user_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 nation_id TEXT COLLATE "C" NOT NULL CHECK(nation_id IN ('kindle','korund','aurelle')),
 frame_id TEXT COLLATE "C" NOT NULL, slogan_id TEXT COLLATE "C" NOT NULL,
 request_id TEXT COLLATE "C" NOT NULL UNIQUE, placed_at BIGINT NOT NULL,
 PRIMARY KEY (x, y));
CREATE TABLE IF NOT EXISTS square_poster_commands (
 request_id TEXT COLLATE "C" PRIMARY KEY,
 clerk_user_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 action TEXT COLLATE "C" NOT NULL CHECK(action IN ('place','remove')),
 x INTEGER NOT NULL, y INTEGER NOT NULL,
 frame_id TEXT COLLATE "C", slogan_id TEXT COLLATE "C", placed_at BIGINT NOT NULL);
