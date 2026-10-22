-- harimu:destructive-reviewed
-- Issue #531: Aurelle guild charter PoC (flag HARIMU_AURELLE_CHARTERS_ENABLED, off). Additive table aurelle_charters (one row per citizen, so the primary key guards a double grant). The only DROP is the aurelle_favor_spends reason CHECK, re-added widened to charter-grant and charter-renew; no row is touched and every existing row still satisfies it.
CREATE TABLE IF NOT EXISTS aurelle_charters (
 clerk_user_id TEXT COLLATE "C" PRIMARY KEY REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 kind TEXT COLLATE "C" NOT NULL CHECK(kind IN ('market-stall')),
 request_id TEXT COLLATE "C" NOT NULL UNIQUE,
 granted_at BIGINT NOT NULL,
 expires_at BIGINT NOT NULL,
 revoked_at BIGINT,
 CHECK(expires_at > granted_at)
);
ALTER TABLE aurelle_favor_spends DROP CONSTRAINT IF EXISTS aurelle_favor_spends_reason_check;
ALTER TABLE aurelle_favor_spends ADD CONSTRAINT aurelle_favor_spends_reason_check CHECK(reason IN ('leave-kinward','charter-grant','charter-renew'));
