-- Issue #43: Korund gray market PoC (smuggled foreign cash "FC", cash-bundle offers and trades). Additive only; runtime use is behind HARIMU_GRAY_MARKET_ENABLED (off).
CREATE TABLE IF NOT EXISTS gray_offers (
 id TEXT PRIMARY KEY,
 clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 amount_minor INTEGER NOT NULL CHECK(amount_minor BETWEEN 1 AND 5000),
 ask_rate INTEGER NOT NULL CHECK(ask_rate BETWEEN 1 AND 10000),
 cash_minor INTEGER NOT NULL CHECK(cash_minor >= 1),
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL CHECK(expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS idx_gray_offers_citizen ON gray_offers(clerk_user_id, created_at);
CREATE TABLE IF NOT EXISTS gray_trades (
 offer_id TEXT PRIMARY KEY REFERENCES gray_offers(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL UNIQUE,
 seller_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 buyer_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 amount_minor INTEGER NOT NULL CHECK(amount_minor >= 1),
 cash_minor INTEGER NOT NULL CHECK(cash_minor >= 1),
 ask_rate INTEGER NOT NULL CHECK(ask_rate >= 1),
 traded_at INTEGER NOT NULL,
 CHECK(seller_id <> buyer_id)
);
CREATE INDEX IF NOT EXISTS idx_gray_trades_buyer ON gray_trades(buyer_id);
CREATE INDEX IF NOT EXISTS idx_gray_trades_seller ON gray_trades(seller_id);
CREATE INDEX IF NOT EXISTS idx_gray_trades_time ON gray_trades(traded_at);
CREATE TABLE IF NOT EXISTS gray_cash_grants (
 clerk_user_id TEXT PRIMARY KEY REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 amount_minor INTEGER NOT NULL CHECK(amount_minor >= 0),
 granted_at INTEGER NOT NULL
);
