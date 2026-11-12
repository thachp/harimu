-- #1341: one poster per purchased square. Replace updates the row; remove deletes it. Commands keep the request id.
CREATE TABLE IF NOT EXISTS square_posters (
 x INTEGER NOT NULL, y INTEGER NOT NULL,
 clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 nation_id TEXT NOT NULL CHECK(nation_id IN ('kindle','korund','aurelle')),
 frame_id TEXT NOT NULL, slogan_id TEXT NOT NULL,
 request_id TEXT NOT NULL UNIQUE, placed_at INTEGER NOT NULL,
 PRIMARY KEY (x, y));
CREATE TABLE IF NOT EXISTS square_poster_commands (
 request_id TEXT PRIMARY KEY,
 clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 action TEXT NOT NULL CHECK(action IN ('place','remove')),
 x INTEGER NOT NULL, y INTEGER NOT NULL,
 frame_id TEXT, slogan_id TEXT, placed_at INTEGER NOT NULL);
