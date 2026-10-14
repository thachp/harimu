-- Issue #86: Kindle income tax. Wages withheld at settlement into the kindle-treasury fund.
-- Additive: new ledger table, treasury fund row, and the wallet balance view nets out withheld tax.
CREATE TABLE IF NOT EXISTS shift_income_tax (
  shift_id TEXT PRIMARY KEY REFERENCES shift_settlements(shift_id) ON DELETE CASCADE,
  clerk_user_id TEXT NOT NULL,
  gross_minor INTEGER NOT NULL CHECK(gross_minor >= 0),
  tax_minor INTEGER NOT NULL CHECK(tax_minor >= 0 AND tax_minor <= gross_minor),
  rate_percent INTEGER NOT NULL CHECK(rate_percent BETWEEN 0 AND 50),
  settled_at TEXT NOT NULL
);
INSERT OR IGNORE INTO economy_funds (id, initial_minor) VALUES ('kindle-treasury', 0);
DROP VIEW IF EXISTS citizen_wallet_balances;
CREATE VIEW citizen_wallet_balances AS
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
INSERT OR IGNORE INTO economy_migrations (id) VALUES ('kindle-income-tax-v1');
