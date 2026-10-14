-- Issue #68: additive festival join log (festival calendar, stances and holidays are derived on read). Existing data is preserved.
CREATE TABLE IF NOT EXISTS citizen_festival_joins (
 user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 festival_id TEXT NOT NULL CHECK(festival_id IN ('night-of-names','oath-day','launching','safe-return','bread-day','day-of-the-open-door')),
 occurrence INTEGER NOT NULL,
 faith_id TEXT NOT NULL CHECK(faith_id IN ('kinward-rite','fair-wind-vow','open-hand')),
 game_day INTEGER NOT NULL,
 joined_at INTEGER NOT NULL,
 request_id TEXT NOT NULL UNIQUE,
 PRIMARY KEY(user_id, festival_id, occurrence)
);
