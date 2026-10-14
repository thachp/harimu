-- Issue #122: additive World Registry square purchases and Tessera ledger. Existing data is preserved.
CREATE TABLE IF NOT EXISTS citizen_tessera_ledger (
 id TEXT PRIMARY KEY,
 clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 delta_minor INTEGER NOT NULL CHECK(delta_minor <> 0),
 reason TEXT NOT NULL CHECK(reason IN ('starter-grant','square-purchase')),
 occurred_at INTEGER NOT NULL,
 CHECK((reason = 'starter-grant' AND delta_minor > 0) OR (reason = 'square-purchase' AND delta_minor < 0))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tessera_starter_once ON citizen_tessera_ledger(clerk_user_id) WHERE reason = 'starter-grant';
CREATE TABLE IF NOT EXISTS world_square_purchases (
 request_id TEXT PRIMARY KEY,
 clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 nation_id TEXT NOT NULL CHECK(nation_id IN ('kindle','korund','aurelle')),
 x INTEGER NOT NULL, y INTEGER NOT NULL,
 price_minor INTEGER NOT NULL CHECK(price_minor > 0),
 purchased_at INTEGER NOT NULL,
 UNIQUE(x, y)
);
