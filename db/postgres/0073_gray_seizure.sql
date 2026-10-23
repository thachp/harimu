-- Issue #797: Korund gray-market checkpoint seizure of cash bundles, destroyed as a money sink (flag HARIMU_GRAY_SEIZURE_ENABLED, off in production).
-- Additive table. The shared Korund LN balance (lib/korund-wallet laborNoteSql) subtracts it whether or not the flag is on, so this must exist before deploy.
CREATE TABLE IF NOT EXISTS gray_seizures (
 offer_id TEXT COLLATE "C" PRIMARY KEY REFERENCES gray_trades(offer_id) ON DELETE CASCADE,
 clerk_user_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 game_day BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(game_day) = 'integer'),
 amount_minor BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(amount_minor) = 'integer' AND amount_minor > 0),
 seized_at BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(seized_at) = 'integer'),
 UNIQUE(clerk_user_id, game_day)
);
