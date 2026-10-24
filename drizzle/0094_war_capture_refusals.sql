-- Issue #912: war hard cap (docs 15.3). One row per refused siege capture (weekly frontier-loss cap or Heartland), the war log of why a square did not flip. Flag HARIMU_WAR_LOSS_CAP_ENABLED (off in production). Additive only. #921 QA1: request_id + unique (siege_id, request_id, reason) so a retry of the same request does not add another row.
CREATE TABLE IF NOT EXISTS war_capture_refusals (
 id TEXT PRIMARY KEY,
 siege_id TEXT NOT NULL REFERENCES city_sieges(id) ON DELETE CASCADE,
 war_id TEXT NOT NULL REFERENCES wars(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL CHECK(length(request_id) BETWEEN 8 AND 64),
 attacker_nation TEXT NOT NULL,
 defender_nation TEXT NOT NULL,
 reason TEXT NOT NULL CHECK(reason IN ('weekly_cap','heartland')),
 squares INTEGER NOT NULL CHECK(squares >= 1),
 lost_in_window INTEGER NOT NULL CHECK(lost_in_window >= 0),
 weekly_limit INTEGER NOT NULL CHECK(weekly_limit >= 1),
 refused_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_war_capture_refusals_attempt ON war_capture_refusals(siege_id, request_id, reason);
CREATE INDEX IF NOT EXISTS idx_war_capture_refusals_war ON war_capture_refusals(war_id, refused_at);
