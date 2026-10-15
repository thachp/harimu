-- Issue #43: Korund gray market PoC (smuggled foreign cash "FC", cash-bundle offers and trades). Additive only; runtime use is behind HARIMU_GRAY_MARKET_ENABLED (off).
CREATE TABLE IF NOT EXISTS gray_offers (
 id TEXT COLLATE "C" PRIMARY KEY,
 clerk_user_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 amount_minor BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(amount_minor) = 'integer' AND amount_minor BETWEEN 1 AND 5000),
 ask_rate BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(ask_rate) = 'integer' AND ask_rate BETWEEN 1 AND 10000),
 cash_minor BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(cash_minor) = 'integer' AND cash_minor >= 1),
 created_at BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(created_at) = 'integer'),
 expires_at BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(expires_at) = 'integer' AND expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS idx_gray_offers_citizen ON gray_offers(clerk_user_id, created_at);
CREATE TABLE IF NOT EXISTS gray_trades (
 offer_id TEXT COLLATE "C" PRIMARY KEY REFERENCES gray_offers(id) ON DELETE CASCADE,
 request_id TEXT COLLATE "C" NOT NULL UNIQUE,
 seller_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 buyer_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 amount_minor BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(amount_minor) = 'integer' AND amount_minor >= 1),
 cash_minor BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(cash_minor) = 'integer' AND cash_minor >= 1),
 ask_rate BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(ask_rate) = 'integer' AND ask_rate >= 1),
 traded_at BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(traded_at) = 'integer'),
 CHECK(seller_id <> buyer_id)
);
CREATE INDEX IF NOT EXISTS idx_gray_trades_buyer ON gray_trades(buyer_id);
CREATE INDEX IF NOT EXISTS idx_gray_trades_seller ON gray_trades(seller_id);
CREATE INDEX IF NOT EXISTS idx_gray_trades_time ON gray_trades(traded_at);
CREATE TABLE IF NOT EXISTS gray_cash_grants (
 clerk_user_id TEXT COLLATE "C" PRIMARY KEY REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 amount_minor BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(amount_minor) = 'integer' AND amount_minor >= 0),
 granted_at BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(granted_at) = 'integer')
);
