-- Issue #199 (Market MVP): fruit and meat spoil once per game day. New ledger table market_spoilage; open-order and inventory views subtract it.
CREATE TABLE IF NOT EXISTS market_spoilage ( id TEXT PRIMARY KEY, clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE, good TEXT NOT NULL REFERENCES market_goods(good) CHECK(good IN ('fruit','meat')), order_id TEXT REFERENCES market_orders(id) ON DELETE CASCADE, kind TEXT NOT NULL DEFAULT 'spoil' CHECK(kind = 'spoil'), qty INTEGER NOT NULL CHECK(typeof(qty) = 'integer' AND qty BETWEEN 1 AND 100000), tick INTEGER NOT NULL CHECK(typeof(tick) = 'integer' AND tick >= 1), spoiled_at INTEGER NOT NULL );
CREATE INDEX IF NOT EXISTS idx_market_spoilage_user_good ON market_spoilage(clerk_user_id, good, tick);
CREATE INDEX IF NOT EXISTS idx_market_spoilage_order ON market_spoilage(order_id);
DROP VIEW IF EXISTS citizen_wallet_balances;
DROP VIEW IF EXISTS citizen_inventory_balances;
DROP VIEW IF EXISTS market_open_orders;
CREATE VIEW market_open_orders AS SELECT * FROM (SELECT o.*, o.qty - COALESCE((SELECT SUM(t.qty) FROM market_trades t WHERE t.buy_order_id = o.id), 0) - COALESCE((SELECT SUM(t.qty) FROM market_trades t WHERE t.sell_order_id = o.id), 0) - COALESCE((SELECT SUM(s.qty) FROM market_spoilage s WHERE s.order_id = o.id), 0) AS remaining FROM market_orders o WHERE NOT EXISTS (SELECT 1 FROM market_order_cancellations x WHERE x.order_id = o.id)) r WHERE remaining > 0;
CREATE VIEW citizen_wallet_balances AS
  SELECT c.clerk_user_id,
    COALESCE((SELECT SUM(wage_minor) FROM shift_settlements WHERE clerk_user_id = c.clerk_user_id), 0)
    + COALESCE((SELECT SUM(wallet_delta) FROM citizen_economy_events WHERE clerk_user_id = c.clerk_user_id), 0)
    + COALESCE((SELECT SUM(amount_minor) FROM player_fills WHERE seller_id = c.clerk_user_id), 0)
    - COALESCE((SELECT SUM(amount_minor) FROM player_fills WHERE buyer_id = c.clerk_user_id), 0)
    + COALESCE((SELECT SUM(t.qty * t.unit_minor) FROM market_trades t JOIN market_orders o ON o.id = t.sell_order_id WHERE o.citizen_id = c.clerk_user_id), 0)
    - COALESCE((SELECT SUM(t.qty * t.unit_minor) FROM market_trades t JOIN market_orders o ON o.id = t.buy_order_id WHERE o.citizen_id = c.clerk_user_id), 0)
    - COALESCE((SELECT SUM(remaining * limit_unit_minor) FROM market_open_orders WHERE citizen_id = c.clerk_user_id AND side = 'buy'), 0) AS balance
  FROM citizens c;
CREATE VIEW citizen_inventory_balances AS
  SELECT c.clerk_user_id, c.item,
    COALESCE((SELECT SUM(quantity) FROM shift_settlements WHERE clerk_user_id=c.clerk_user_id AND item=c.item),0)
    + COALESCE((SELECT SUM(quantity_delta) FROM citizen_economy_events WHERE clerk_user_id=c.clerk_user_id AND item=c.item),0)
    + CASE WHEN c.item='food' THEN COALESCE((SELECT quantity FROM starter_food_grants WHERE clerk_user_id=c.clerk_user_id),0) ELSE 0 END
    - COALESCE((SELECT SUM(quantity) FROM player_open_lots WHERE seller_id=c.clerk_user_id AND item=c.item),0)
    - COALESCE((SELECT SUM(quantity) FROM player_fills WHERE seller_id=c.clerk_user_id AND item=c.item),0)
    + COALESCE((SELECT SUM(quantity) FROM player_fills WHERE buyer_id=c.clerk_user_id AND item=c.item),0)
    + COALESCE((SELECT SUM(t.qty) FROM market_trades t JOIN market_orders o ON o.id=t.buy_order_id WHERE o.citizen_id=c.clerk_user_id AND t.good=c.item),0)
    - COALESCE((SELECT SUM(t.qty) FROM market_trades t JOIN market_orders o ON o.id=t.sell_order_id WHERE o.citizen_id=c.clerk_user_id AND t.good=c.item),0)
    - COALESCE((SELECT SUM(remaining) FROM market_open_orders WHERE citizen_id=c.clerk_user_id AND side='sell' AND good=c.item),0)
    - COALESCE((SELECT SUM(qty) FROM market_spoilage WHERE clerk_user_id=c.clerk_user_id AND good=c.item),0) AS quantity
  FROM (
    SELECT clerk_user_id,item FROM shift_settlements
    UNION SELECT clerk_user_id,item FROM citizen_economy_events
    UNION SELECT clerk_user_id,'food' AS item FROM starter_food_grants
    UNION SELECT buyer_id AS clerk_user_id,item FROM player_fills
    UNION SELECT citizen_id AS clerk_user_id,good AS item FROM market_orders WHERE citizen_id IS NOT NULL
  ) c;
INSERT OR IGNORE INTO economy_migrations (id) VALUES ('market-spoilage-v1');
