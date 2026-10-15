-- Issue #419 (siege PoC, slice A): additive city siege, successful-assault and capture records, plus the per-square child #495 can count. Existing data is preserved. Written only by the server path behind HARIMU_WAR_ENABLED (slice B).
CREATE TABLE IF NOT EXISTS city_sieges (
 id TEXT PRIMARY KEY,
 war_id TEXT NOT NULL REFERENCES wars(id) ON DELETE CASCADE,
 city_key TEXT NOT NULL CHECK(length(city_key) BETWEEN 3 AND 80),
 city_kind TEXT NOT NULL CHECK(city_kind IN ('outpost','founded')),
 center_x INTEGER NOT NULL, center_y INTEGER NOT NULL,
 attacker_nation TEXT NOT NULL REFERENCES nations(id),
 defender_nation TEXT NOT NULL REFERENCES nations(id),
 created_at INTEGER NOT NULL,
 captured_at INTEGER,
 CHECK(attacker_nation<>defender_nation),
 UNIQUE(war_id, city_key)
);
CREATE TABLE IF NOT EXISTS siege_assaults (
 request_id TEXT PRIMARY KEY,
 siege_id TEXT NOT NULL REFERENCES city_sieges(id) ON DELETE CASCADE,
 assault_day INTEGER NOT NULL CHECK(assault_day >= 0),
 assaulted_at INTEGER NOT NULL,
 UNIQUE(siege_id, assault_day)
);
CREATE TABLE IF NOT EXISTS city_captures (
 id TEXT PRIMARY KEY,
 siege_id TEXT NOT NULL UNIQUE REFERENCES city_sieges(id) ON DELETE CASCADE,
 war_id TEXT NOT NULL REFERENCES wars(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL UNIQUE,
 attacker_nation TEXT NOT NULL REFERENCES nations(id),
 defender_nation TEXT NOT NULL REFERENCES nations(id),
 squares_transferred INTEGER NOT NULL CHECK(squares_transferred >= 0),
 squares_kept_private INTEGER NOT NULL CHECK(squares_kept_private >= 0),
 captured_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS city_capture_squares (
 capture_id TEXT NOT NULL REFERENCES city_captures(id) ON DELETE CASCADE,
 x INTEGER NOT NULL, y INTEGER NOT NULL,
 from_nation TEXT NOT NULL REFERENCES nations(id),
 to_nation TEXT NOT NULL REFERENCES nations(id),
 PRIMARY KEY(capture_id, x, y)
);
CREATE INDEX IF NOT EXISTS idx_city_sieges_war ON city_sieges(war_id);
CREATE INDEX IF NOT EXISTS idx_city_captures_war ON city_captures(war_id, defender_nation);
