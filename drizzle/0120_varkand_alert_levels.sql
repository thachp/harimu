-- Issue #1081: Varkand's Alert Level set by the Directorate, flag HARIMU_VARKAND_ALERT_ENABLED. Additive; newest row is the current level, none = Green.
CREATE TABLE IF NOT EXISTS varkand_alert_levels (
 seq INTEGER PRIMARY KEY,
 level TEXT NOT NULL CHECK(level IN ('green','amber','red')),
 set_at INTEGER NOT NULL
);
