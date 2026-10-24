-- Issue #933: partial siege capture up to the weekly frontier-loss cap. Drop UNIQUE(siege_id) on city_captures so each assault step can record its own row; request_id stays unique. Flag HARIMU_WAR_LOSS_CAP_ENABLED.
PRAGMA foreign_keys=OFF;
CREATE TABLE IF NOT EXISTS city_captures_933 (
 id TEXT PRIMARY KEY,
 siege_id TEXT NOT NULL REFERENCES city_sieges(id) ON DELETE CASCADE,
 war_id TEXT NOT NULL REFERENCES wars(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL UNIQUE,
 attacker_nation TEXT NOT NULL REFERENCES nations(id),
 defender_nation TEXT NOT NULL REFERENCES nations(id),
 squares_transferred INTEGER NOT NULL CHECK(squares_transferred >= 0),
 squares_kept_private INTEGER NOT NULL CHECK(squares_kept_private >= 0),
 captured_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO city_captures_933 SELECT id,siege_id,war_id,request_id,attacker_nation,defender_nation,squares_transferred,squares_kept_private,captured_at FROM city_captures;
DROP TABLE IF EXISTS city_captures;
ALTER TABLE city_captures_933 RENAME TO city_captures;
CREATE INDEX IF NOT EXISTS idx_city_captures_war ON city_captures(war_id, defender_nation);
CREATE INDEX IF NOT EXISTS idx_city_captures_siege ON city_captures(siege_id);
PRAGMA foreign_keys=ON;
