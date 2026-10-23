-- Issue #781: domestic home-city move for a flat fee (sink) with a 7-real-day cooldown (flag HARIMU_HOME_CITY_MOVE_ENABLED, off in production). Additive table; the fee is charged in the nation's wallet currency (ARC: SPK for Kindle, LN for Korund); the SPK wallet view nets SPK fees and the shared LN formula (lib/korund-wallet) nets LN fees (CREATE OR REPLACE, same columns).
CREATE TABLE IF NOT EXISTS home_city_moves (
 request_id TEXT COLLATE "C" PRIMARY KEY,
 clerk_user_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 nation_id TEXT COLLATE "C" NOT NULL,
 from_city_id TEXT COLLATE "C" NOT NULL,
 to_city_id TEXT COLLATE "C" NOT NULL,
 currency TEXT COLLATE "C" NOT NULL CHECK(currency IN ('SPK', 'LN')),
 fee_minor BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(fee_minor) = 'integer' AND fee_minor > 0),
 moved_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_home_city_moves_user ON home_city_moves(clerk_user_id, moved_at);
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
    - COALESCE((SELECT SUM(fee_minor) FROM home_city_moves WHERE clerk_user_id = c.clerk_user_id AND currency = 'SPK'), 0)
    - COALESCE((SELECT SUM(remaining * limit_unit_minor) FROM market_open_orders WHERE citizen_id = c.clerk_user_id AND side = 'buy'), 0) AS balance
  FROM citizens c;
INSERT INTO economy_migrations (id) VALUES ('home-move-v1') ON CONFLICT (id) DO NOTHING;
