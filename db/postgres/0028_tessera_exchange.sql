-- Issue #210: Clearing House kiosk, the citizen Tessera source. Additive only: the balance view uses CREATE OR REPLACE (same columns).
CREATE TABLE IF NOT EXISTS citizen_tessera_exchanges (
 request_id TEXT COLLATE "C" PRIMARY KEY,
 clerk_user_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 nation_id TEXT COLLATE "C" NOT NULL CHECK(nation_id = 'kindle'),
 spark_minor BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(spark_minor) = 'integer' AND spark_minor > 0),
 tessera_minor BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(tessera_minor) = 'integer' AND tessera_minor > 0),
 occurred_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tessera_exchanges_citizen ON citizen_tessera_exchanges(clerk_user_id, occurred_at);
CREATE OR REPLACE VIEW citizen_wallet_balances AS
  SELECT c.clerk_user_id,
    COALESCE((SELECT SUM(wage_minor) FROM shift_settlements WHERE clerk_user_id = c.clerk_user_id), 0)
    + COALESCE((SELECT SUM(wallet_delta) FROM citizen_economy_events WHERE clerk_user_id = c.clerk_user_id), 0)
    - COALESCE((SELECT SUM(spark_minor) FROM citizen_tessera_exchanges WHERE clerk_user_id = c.clerk_user_id), 0)
    + COALESCE((SELECT SUM(amount_minor) FROM player_fills WHERE seller_id = c.clerk_user_id), 0)
    - COALESCE((SELECT SUM(amount_minor) FROM player_fills WHERE buyer_id = c.clerk_user_id), 0)
    + COALESCE((SELECT SUM(t.qty * t.unit_minor) FROM market_trades t JOIN market_orders o ON o.id = t.sell_order_id WHERE o.citizen_id = c.clerk_user_id), 0)
    - COALESCE((SELECT SUM(t.qty * t.unit_minor) FROM market_trades t JOIN market_orders o ON o.id = t.buy_order_id WHERE o.citizen_id = c.clerk_user_id), 0)
    - COALESCE((SELECT SUM(remaining * limit_unit_minor) FROM market_open_orders WHERE citizen_id = c.clerk_user_id AND side = 'buy'), 0) AS balance
  FROM citizens c;
INSERT INTO economy_migrations (id) VALUES ('tessera-exchange-v1') ON CONFLICT (id) DO NOTHING;
