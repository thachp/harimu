-- Issue #295: Korund underground worship inspections (capped raids). Additive: two new tables, existing data untouched.
-- Underground worship itself reuses citizen_worship. Hits and raids are written only by the world tick behind HARIMU_FAITH_ENABLED.
CREATE TABLE IF NOT EXISTS korund_raids (
 id TEXT COLLATE "C" PRIMARY KEY,
 city_id TEXT COLLATE "C" NOT NULL,
 game_day BIGINT NOT NULL,
 raided_at BIGINT NOT NULL,
 UNIQUE(city_id, game_day)
);
CREATE TABLE IF NOT EXISTS korund_raid_hits (
 raid_id TEXT COLLATE "C" NOT NULL REFERENCES korund_raids(id),
 user_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 game_day BIGINT NOT NULL,
 raided_at BIGINT NOT NULL,
 devotion_hit BIGINT NOT NULL CHECK(devotion_hit BETWEEN 0 AND 10),
 PRIMARY KEY(raid_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_korund_raids_at ON korund_raids(raided_at);
CREATE INDEX IF NOT EXISTS idx_korund_raid_hits_user ON korund_raid_hits(user_id, raided_at);
