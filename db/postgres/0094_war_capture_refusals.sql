-- Issue #912: war hard cap (docs 15.3). One row per refused siege capture (weekly frontier-loss cap or Heartland), the war log of why a square did not flip. Flag HARIMU_WAR_LOSS_CAP_ENABLED (off in production). Additive only.
CREATE TABLE IF NOT EXISTS war_capture_refusals (
 id TEXT COLLATE "C" PRIMARY KEY,
 siege_id TEXT COLLATE "C" NOT NULL REFERENCES city_sieges(id) ON DELETE CASCADE,
 war_id TEXT COLLATE "C" NOT NULL REFERENCES wars(id) ON DELETE CASCADE,
 attacker_nation TEXT COLLATE "C" NOT NULL,
 defender_nation TEXT COLLATE "C" NOT NULL,
 reason TEXT COLLATE "C" NOT NULL CHECK(reason IN ('weekly_cap','heartland')),
 squares INTEGER NOT NULL CHECK(squares >= 1),
 lost_in_window INTEGER NOT NULL CHECK(lost_in_window >= 0),
 weekly_limit INTEGER NOT NULL CHECK(weekly_limit >= 1),
 refused_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_war_capture_refusals_war ON war_capture_refusals(war_id, refused_at);
