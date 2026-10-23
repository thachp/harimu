-- Issue #863: Kindle campaign donations PoC (docs 9.4). Each row moves Spark from a citizen wallet (the balance view below) to an AI party account (SUM by party). Flag HARIMU_PARTY_DONATIONS_ENABLED (off in production). Additive only.
CREATE TABLE IF NOT EXISTS party_donations (
 request_id TEXT PRIMARY KEY,
 clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 party_id TEXT NOT NULL,
 amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor) = 'integer' AND amount_minor > 0),
 week INTEGER NOT NULL, donated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_party_donations_party ON party_donations(party_id, donated_at);
CREATE INDEX IF NOT EXISTS idx_party_donations_user ON party_donations(clerk_user_id, party_id, week);
DROP VIEW IF EXISTS citizen_wallet_balances;
CREATE VIEW citizen_wallet_balances AS
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
    + COALESCE((SELECT SUM(credit_minor) FROM savings_shield_credits WHERE clerk_user_id = c.clerk_user_id AND status = 'paid'), 0)
    - COALESCE((SELECT SUM(amount_minor) FROM party_donations WHERE clerk_user_id = c.clerk_user_id), 0)
    - COALESCE((SELECT SUM(remaining * limit_unit_minor) FROM market_open_orders WHERE citizen_id = c.clerk_user_id AND side = 'buy'), 0) AS balance
  FROM citizens c;
INSERT OR IGNORE INTO economy_migrations (id) VALUES ('party-donations-v1');
