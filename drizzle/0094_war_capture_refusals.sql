-- Issue #912: war hard cap (docs 15.3). Refused captures (siege or battle) and battle frontier transfers for the weekly ledger. Flag HARIMU_WAR_LOSS_CAP_ENABLED (off in production). Additive only. #921 QA1: unique per attempt; #934: battle_key + war_frontier_transfers.
CREATE TABLE IF NOT EXISTS war_capture_refusals (
 id TEXT PRIMARY KEY,
 siege_id TEXT REFERENCES city_sieges(id) ON DELETE CASCADE,
 battle_key TEXT,
 war_id TEXT NOT NULL REFERENCES wars(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL CHECK(length(request_id) BETWEEN 8 AND 64),
 attacker_nation TEXT NOT NULL,
 defender_nation TEXT NOT NULL,
 reason TEXT NOT NULL CHECK(reason IN ('weekly_cap','heartland')),
 squares INTEGER NOT NULL CHECK(squares >= 1),
 lost_in_window INTEGER NOT NULL CHECK(lost_in_window >= 0),
 weekly_limit INTEGER NOT NULL CHECK(weekly_limit >= 1),
 refused_at INTEGER NOT NULL,
 CHECK((siege_id IS NOT NULL AND battle_key IS NULL) OR (siege_id IS NULL AND battle_key IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_war_capture_refusals_siege ON war_capture_refusals(siege_id, request_id, reason) WHERE siege_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_war_capture_refusals_battle ON war_capture_refusals(battle_key, request_id, reason) WHERE battle_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_war_capture_refusals_war ON war_capture_refusals(war_id, refused_at);
CREATE TABLE IF NOT EXISTS war_frontier_transfers (
 id TEXT PRIMARY KEY,
 war_id TEXT NOT NULL REFERENCES wars(id) ON DELETE CASCADE,
 battle_key TEXT NOT NULL,
 request_id TEXT NOT NULL,
 x INTEGER NOT NULL, y INTEGER NOT NULL,
 from_nation TEXT NOT NULL, to_nation TEXT NOT NULL,
 transferred_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_war_frontier_transfers_from ON war_frontier_transfers(from_nation, transferred_at);
