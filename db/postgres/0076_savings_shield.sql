-- Issue #824: Kindle Dormant Savings Shield (docs 12.8), flag HARIMU_SAVINGS_SHIELD_ENABLED (off in production). Additive table; one row per returning absence.
-- 'paid' rows are the Kindle treasury welfare-line debit (lib/economy kindleTreasuryBalanceSql) and the wallet credit (the balance view below, CREATE OR REPLACE, same columns).
CREATE TABLE IF NOT EXISTS savings_shield_credits (
 absence_key TEXT COLLATE "C" PRIMARY KEY,
 clerk_user_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 absence_started_at BIGINT NOT NULL, returned_at BIGINT NOT NULL, balance_minor BIGINT NOT NULL,
 index_start_tenths BIGINT NOT NULL, index_end_tenths BIGINT NOT NULL,
 credit_minor BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(credit_minor) = 'integer' AND credit_minor >= 0),
 status TEXT COLLATE "C" NOT NULL CHECK(status IN ('paid', 'skipped')), reason TEXT COLLATE "C" NOT NULL,
 CHECK((status = 'paid') = (credit_minor > 0))
);
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
    + COALESCE((SELECT SUM(credit_minor) FROM savings_shield_credits WHERE clerk_user_id = c.clerk_user_id AND status = 'paid'), 0)
    - COALESCE((SELECT SUM(remaining * limit_unit_minor) FROM market_open_orders WHERE citizen_id = c.clerk_user_id AND side = 'buy'), 0) AS balance
  FROM citizens c;
INSERT INTO economy_migrations (id) VALUES ('savings-shield-v1') ON CONFLICT (id) DO NOTHING;
