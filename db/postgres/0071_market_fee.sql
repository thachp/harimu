-- Issue #777: goods-market seller fee as a money sink (flag HARIMU_MARKET_FEE_ENABLED, off in production). Additive: the balance view uses CREATE OR REPLACE (same columns).
CREATE TABLE IF NOT EXISTS market_trade_fees (
 trade_id TEXT COLLATE "C" PRIMARY KEY REFERENCES market_trades(id) ON DELETE CASCADE,
 seller_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 fee_minor BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(fee_minor) = 'integer' AND fee_minor > 0),
 charged_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_market_trade_fees_seller ON market_trade_fees(seller_id, charged_at);
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
    - COALESCE((SELECT SUM(remaining * limit_unit_minor) FROM market_open_orders WHERE citizen_id = c.clerk_user_id AND side = 'buy'), 0) AS balance
  FROM citizens c;
INSERT INTO economy_migrations (id) VALUES ('market-fee-v1') ON CONFLICT (id) DO NOTHING;
