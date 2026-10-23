-- Issue #844 follow-up (#857): re-create the wallet view after #863 (0085) so it nets out BOTH party donations and fixed-lot sales tax (0083's line was dropped by 0085's view). Same columns; additive only.
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
    - COALESCE((SELECT SUM(tax_minor) FROM market_sales_tax WHERE seller_id = c.clerk_user_id), 0)
    - COALESCE((SELECT SUM(tax_minor) FROM player_fill_sales_tax WHERE seller_id = c.clerk_user_id), 0)
    - COALESCE((SELECT SUM(fee_minor) FROM home_city_moves WHERE clerk_user_id = c.clerk_user_id AND currency = 'SPK'), 0)
    + COALESCE((SELECT SUM(credit_minor) FROM savings_shield_credits WHERE clerk_user_id = c.clerk_user_id AND status = 'paid'), 0)
    - COALESCE((SELECT SUM(amount_minor) FROM party_donations WHERE clerk_user_id = c.clerk_user_id), 0)
    - COALESCE((SELECT SUM(remaining * limit_unit_minor) FROM market_open_orders WHERE citizen_id = c.clerk_user_id AND side = 'buy'), 0) AS balance
  FROM citizens c;
INSERT OR IGNORE INTO economy_migrations (id) VALUES ('kindle-sales-tax-v3');
