-- Issue #1081: Varkand's Alert Level set by the Directorate, flag HARIMU_VARKAND_ALERT_ENABLED. Additive; one row (id 1) is the current level, none = Green.
CREATE TABLE IF NOT EXISTS varkand_alert_levels (
 id BIGINT PRIMARY KEY CHECK(id = 1),
 level TEXT COLLATE "C" NOT NULL CHECK(level IN ('green','amber','red')),
 set_at BIGINT NOT NULL
);
