-- Issue #797: Korund gray-market checkpoint seizure of cash bundles, destroyed as a money sink (flag HARIMU_GRAY_SEIZURE_ENABLED, off in production).
-- Additive table. The shared Korund LN balance (lib/korund-wallet laborNoteSql) subtracts it whether or not the flag is on, so this must exist before deploy.
CREATE TABLE IF NOT EXISTS gray_seizures (
 offer_id TEXT PRIMARY KEY REFERENCES gray_trades(offer_id) ON DELETE CASCADE,
 clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 game_day INTEGER NOT NULL,
 amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
 seized_at INTEGER NOT NULL,
 UNIQUE(clerk_user_id, game_day)
);
