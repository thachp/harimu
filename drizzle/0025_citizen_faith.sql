-- Issue #67: additive citizen faith attribute and worship log (Devotion is derived on read). Existing data is preserved.
CREATE TABLE IF NOT EXISTS citizen_faith (
 user_id TEXT PRIMARY KEY REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 nation_id TEXT NOT NULL CHECK(nation_id IN ('kindle','korund','aurelle')),
 faith_id TEXT NOT NULL CHECK(faith_id IN ('unaffiliated','kinward-rite','fair-wind-vow','open-hand')),
 hidden_faith_id TEXT CHECK(hidden_faith_id IS NULL OR (nation_id='korund' AND hidden_faith_id IN ('kinward-rite','fair-wind-vow','open-hand'))),
 chosen_at INTEGER NOT NULL,
 request_id TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS citizen_worship (
 user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 game_day INTEGER NOT NULL,
 faith_id TEXT NOT NULL CHECK(faith_id IN ('kinward-rite','fair-wind-vow','open-hand')),
 worshipped_at INTEGER NOT NULL,
 request_id TEXT NOT NULL UNIQUE,
 PRIMARY KEY(user_id, game_day)
);
