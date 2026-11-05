-- Issue #1086: log foundation-truce refusals (docs §15.4, follow-up to #1070) by widening war_capture_refusals.reason to 'foundation_truce'.
-- SQLite cannot alter a CHECK, so the table is rebuilt (0103 pattern). Rows are copied unchanged; the 0094 indexes are re-created.
DROP TABLE IF EXISTS war_capture_refusals_old;
ALTER TABLE war_capture_refusals RENAME TO war_capture_refusals_old;
DROP INDEX IF EXISTS idx_war_capture_refusals_siege;
DROP INDEX IF EXISTS idx_war_capture_refusals_battle;
DROP INDEX IF EXISTS idx_war_capture_refusals_war;
CREATE TABLE war_capture_refusals (
 id TEXT PRIMARY KEY,
 siege_id TEXT REFERENCES city_sieges(id) ON DELETE CASCADE,
 battle_key TEXT,
 war_id TEXT NOT NULL REFERENCES wars(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL CHECK(length(request_id) BETWEEN 8 AND 64),
 attacker_nation TEXT NOT NULL,
 defender_nation TEXT NOT NULL,
 reason TEXT NOT NULL CHECK(reason IN ('weekly_cap','heartland','foundation_truce')),
 squares INTEGER NOT NULL CHECK(squares >= 1),
 lost_in_window INTEGER NOT NULL CHECK(lost_in_window >= 0),
 weekly_limit INTEGER NOT NULL CHECK(weekly_limit >= 1),
 refused_at INTEGER NOT NULL,
 CHECK((siege_id IS NOT NULL AND battle_key IS NULL) OR (siege_id IS NULL AND battle_key IS NOT NULL))
);
INSERT INTO war_capture_refusals (id,siege_id,battle_key,war_id,request_id,attacker_nation,defender_nation,reason,squares,lost_in_window,weekly_limit,refused_at)
 SELECT id,siege_id,battle_key,war_id,request_id,attacker_nation,defender_nation,reason,squares,lost_in_window,weekly_limit,refused_at FROM war_capture_refusals_old;
DROP TABLE war_capture_refusals_old;
CREATE UNIQUE INDEX IF NOT EXISTS idx_war_capture_refusals_siege ON war_capture_refusals(siege_id, request_id, reason) WHERE siege_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_war_capture_refusals_battle ON war_capture_refusals(battle_key, request_id, reason) WHERE battle_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_war_capture_refusals_war ON war_capture_refusals(war_id, refused_at);
