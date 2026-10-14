-- Issue #86: Kindle income tax. Additive only: the balance view uses CREATE OR REPLACE (same columns).
CREATE TABLE IF NOT EXISTS shift_income_tax (
  shift_id TEXT COLLATE "C" PRIMARY KEY REFERENCES shift_settlements(shift_id) ON DELETE CASCADE,
  clerk_user_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
  gross_minor BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(gross_minor) = 'integer' AND gross_minor >= 0),
  tax_minor BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(tax_minor) = 'integer' AND tax_minor >= 0 AND tax_minor <= gross_minor),
  rate_percent BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(rate_percent) = 'integer' AND rate_percent BETWEEN 0 AND 50),
  settled_at TEXT COLLATE "C" NOT NULL
);
INSERT INTO economy_funds (id, initial_minor) VALUES ('kindle-treasury', 0) ON CONFLICT (id) DO NOTHING;
CREATE OR REPLACE VIEW citizen_wallet_balances AS
  SELECT c.clerk_user_id,
    COALESCE((SELECT SUM(wage_minor) FROM shift_settlements WHERE clerk_user_id = c.clerk_user_id), 0)
    - COALESCE((SELECT SUM(tax_minor) FROM shift_income_tax WHERE clerk_user_id = c.clerk_user_id), 0)
    + COALESCE((SELECT SUM(wallet_delta) FROM citizen_economy_events WHERE clerk_user_id = c.clerk_user_id), 0)
    + COALESCE((SELECT SUM(amount_minor) FROM player_fills WHERE seller_id = c.clerk_user_id), 0)
    - COALESCE((SELECT SUM(amount_minor) FROM player_fills WHERE buyer_id = c.clerk_user_id), 0)
    + COALESCE((SELECT SUM(t.qty * t.unit_minor) FROM market_trades t JOIN market_orders o ON o.id = t.sell_order_id WHERE o.citizen_id = c.clerk_user_id), 0)
    - COALESCE((SELECT SUM(t.qty * t.unit_minor) FROM market_trades t JOIN market_orders o ON o.id = t.buy_order_id WHERE o.citizen_id = c.clerk_user_id), 0)
    - COALESCE((SELECT SUM(remaining * limit_unit_minor) FROM market_open_orders WHERE citizen_id = c.clerk_user_id AND side = 'buy'), 0) AS balance
  FROM citizens c;
INSERT INTO economy_migrations (id) VALUES ('kindle-income-tax-v1') ON CONFLICT (id) DO NOTHING;
