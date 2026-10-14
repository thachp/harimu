-- Issue #67: additive citizen faith attribute and worship log (Devotion is derived on read). Existing data is preserved.
CREATE TABLE IF NOT EXISTS citizen_faith (
 user_id TEXT COLLATE "C" PRIMARY KEY REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 nation_id TEXT COLLATE "C" NOT NULL CHECK(nation_id IN ('kindle','korund','aurelle')),
 faith_id TEXT COLLATE "C" NOT NULL CHECK(faith_id IN ('unaffiliated','kinward-rite','fair-wind-vow','open-hand')),
 hidden_faith_id TEXT COLLATE "C" CHECK(hidden_faith_id IS NULL OR (nation_id='korund' AND hidden_faith_id IN ('kinward-rite','fair-wind-vow','open-hand'))),
 chosen_at BIGINT NOT NULL,
 request_id TEXT COLLATE "C" NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS citizen_worship (
 user_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 game_day BIGINT NOT NULL,
 faith_id TEXT COLLATE "C" NOT NULL CHECK(faith_id IN ('kinward-rite','fair-wind-vow','open-hand')),
 worshipped_at BIGINT NOT NULL,
 request_id TEXT COLLATE "C" NOT NULL UNIQUE,
 PRIMARY KEY(user_id, game_day)
);
