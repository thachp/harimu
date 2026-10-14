-- Issue #210: Clearing House kiosk, the citizen Tessera source (replaces the temporary starter grant).
-- Additive: new exchange table; the wallet balance view also debits Spark spent at the kiosk.
CREATE TABLE IF NOT EXISTS citizen_tessera_exchanges (
 request_id TEXT PRIMARY KEY,
 clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 nation_id TEXT NOT NULL CHECK(nation_id = 'kindle'),
 spark_minor INTEGER NOT NULL CHECK(spark_minor > 0),
 tessera_minor INTEGER NOT NULL CHECK(tessera_minor > 0),
 occurred_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tessera_exchanges_citizen ON citizen_tessera_exchanges(clerk_user_id, occurred_at);
DROP VIEW IF EXISTS citizen_wallet_balances;
CREATE VIEW citizen_wallet_balances AS
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
INSERT OR IGNORE INTO economy_migrations (id) VALUES ('tessera-exchange-v1');
