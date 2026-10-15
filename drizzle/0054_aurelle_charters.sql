-- Issue #531: Aurelle guild charter PoC (flag HARIMU_AURELLE_CHARTERS_ENABLED, off). Additive table aurelle_charters (one row per citizen, so the primary key guards a double grant) and the aurelle_favor_spends reason CHECK widened to charter-grant and charter-renew.
CREATE TABLE IF NOT EXISTS aurelle_charters (
 clerk_user_id TEXT PRIMARY KEY REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('market-stall')),
 request_id TEXT NOT NULL UNIQUE,
 granted_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 revoked_at INTEGER,
 CHECK(expires_at > granted_at)
);
-- aurelle_favor_spends: SQLite cannot alter a CHECK, so the table is rebuilt (same pattern as 0049). Rows are copied unchanged. A leftover aurelle_favor_spends_old (an interrupted earlier run) is removed first.
DROP TABLE IF EXISTS aurelle_favor_spends_old;
ALTER TABLE aurelle_favor_spends RENAME TO aurelle_favor_spends_old;
CREATE TABLE aurelle_favor_spends (request_id TEXT PRIMARY KEY, clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE, amount INTEGER NOT NULL CHECK(amount>0), reason TEXT NOT NULL CHECK(reason IN ('leave-kinward','charter-grant','charter-renew')), spent_at INTEGER NOT NULL);
INSERT INTO aurelle_favor_spends (request_id,clerk_user_id,amount,reason,spent_at) SELECT request_id,clerk_user_id,amount,reason,spent_at FROM aurelle_favor_spends_old;
DROP TABLE aurelle_favor_spends_old;
-- The #616 index went with the old table; recreate it.
CREATE INDEX IF NOT EXISTS idx_aurelle_favor_spends_user_spent ON aurelle_favor_spends(clerk_user_id, spent_at, amount);
