-- Issue #1340: Kindle congregation donations (docs 14.4). Each row moves Spark from a citizen wallet (the balance view below, CREATE OR REPLACE, same columns) to a congregation fund (SUM by congregation). Flag HARIMU_CONGREGATION_DONATIONS_ENABLED (off in production). Additive only.
CREATE TABLE IF NOT EXISTS congregation_donations (
 request_id TEXT COLLATE "C" PRIMARY KEY,
 clerk_user_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 congregation_id TEXT COLLATE "C" NOT NULL,
 amount_minor BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(amount_minor) = 'integer' AND amount_minor > 0),
 donated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_congregation_donations_congregation ON congregation_donations(congregation_id);
CREATE INDEX IF NOT EXISTS idx_congregation_donations_user ON congregation_donations(clerk_user_id, donated_at);
CREATE OR REPLACE VIEW citizen_wallet_balances AS
  SELECT c.clerk_user_id,
    COALESCE((SELECT SUM(wage_minor) FROM shift_settlements WHERE clerk_user_id = c.clerk_user_id), 0)
    - COALESCE((SELECT SUM(tax_minor) FROM shift_income_tax WHERE clerk_user_id = c.clerk_user_id), 0)
    + COALESCE((SELECT SUM(wallet_delta) FROM citizen_economy_events WHERE clerk_user_id = c.clerk_user_id), 0)
    - COALESCE((SELECT SUM(spark_minor) FROM citizen_tessera_exchanges WHERE clerk_user_id = c.clerk_user_id), 0)
    + COALESCE((SELECT SUM(amount_minor) FROM player_fills WHERE seller_id = c.clerk_user_id), 0)
    - COALESCE((SELECT SUM(amount_minor) FROM player_fills WHERE buyer_id = c.clerk_user_id), 0)
    + COALESCE((SELECT SUM(t.qty * t.unit_minor) FROM market_trades t JOIN market_orders o ON o.id = t.sell_order_id WHERE o.citizen_id = c.clerk_user_id), 0)
    - COALESCE((SELECT SUM(t.qty * t.unit_minor) FROM market_trades t JOIN market_orders o ON o.id = t.buy_order_id WHERE o.citizen_id = c.clerk_user_id), 0)
    - COALESCE((SELECT SUM(fee_minor) FROM market_trade_fees WHERE seller_id = c.clerk_user_id), 0)
    - COALESCE((SELECT SUM(tax_minor) FROM market_sales_tax WHERE seller_id = c.clerk_user_id), 0)
    - COALESCE((SELECT SUM(tax_minor) FROM player_fill_sales_tax WHERE seller_id = c.clerk_user_id), 0)
    - COALESCE((SELECT SUM(fee_minor) FROM home_city_moves WHERE clerk_user_id = c.clerk_user_id AND currency = 'SPK'), 0)
    + COALESCE((SELECT SUM(credit_minor) FROM savings_shield_credits WHERE clerk_user_id = c.clerk_user_id AND status = 'paid'), 0)
    - COALESCE((SELECT SUM(amount_minor) FROM party_donations WHERE clerk_user_id = c.clerk_user_id), 0)
    - COALESCE((SELECT SUM(amount_minor) FROM congregation_donations WHERE clerk_user_id = c.clerk_user_id), 0)
    - COALESCE((SELECT SUM(remaining * limit_unit_minor) FROM market_open_orders WHERE citizen_id = c.clerk_user_id AND side = 'buy'), 0) AS balance
  FROM citizens c;
INSERT INTO economy_migrations (id) VALUES ('congregation-donations-v1') ON CONFLICT (id) DO NOTHING;
