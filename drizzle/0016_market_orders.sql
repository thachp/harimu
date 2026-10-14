-- Issue #195 (Market MVP): goods catalog + city order book. Additive tables; balance views are rebuilt to include escrow and trades.
CREATE TABLE IF NOT EXISTS market_goods ( good TEXT PRIMARY KEY CHECK(good IN ('fruit','meat','wood')), label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 32), unit TEXT NOT NULL CHECK(length(unit) BETWEEN 1 AND 16), perishable INTEGER NOT NULL CHECK(perishable IN (0, 1)), shelf_life_days INTEGER CHECK((perishable = 1 AND typeof(shelf_life_days) = 'integer' AND shelf_life_days BETWEEN 1 AND 365) OR (perishable = 0 AND shelf_life_days IS NULL)) );
CREATE TABLE IF NOT EXISTS market_orders ( id TEXT PRIMARY KEY, city_id TEXT NOT NULL CHECK(length(city_id) BETWEEN 1 AND 64), citizen_id TEXT REFERENCES citizens(clerk_user_id) ON DELETE CASCADE, npc_id TEXT CHECK(npc_id IS NULL OR length(npc_id) BETWEEN 1 AND 64), side TEXT NOT NULL CHECK(side IN ('buy', 'sell')), good TEXT NOT NULL REFERENCES market_goods(good), qty INTEGER NOT NULL CHECK(typeof(qty) = 'integer' AND qty BETWEEN 1 AND 1000), limit_unit_minor INTEGER NOT NULL CHECK(typeof(limit_unit_minor) = 'integer' AND limit_unit_minor BETWEEN 1 AND 100000), created_at INTEGER NOT NULL, CHECK((citizen_id IS NULL) != (npc_id IS NULL)) );
CREATE TABLE IF NOT EXISTS market_order_cancellations ( request_id TEXT PRIMARY KEY, order_id TEXT NOT NULL UNIQUE REFERENCES market_orders(id) ON DELETE CASCADE, cancelled_at INTEGER NOT NULL );
CREATE TABLE IF NOT EXISTS market_trades ( id TEXT PRIMARY KEY, buy_order_id TEXT NOT NULL REFERENCES market_orders(id) ON DELETE CASCADE, sell_order_id TEXT NOT NULL REFERENCES market_orders(id) ON DELETE CASCADE, good TEXT NOT NULL REFERENCES market_goods(good), qty INTEGER NOT NULL CHECK(typeof(qty) = 'integer' AND qty BETWEEN 1 AND 1000), unit_minor INTEGER NOT NULL CHECK(typeof(unit_minor) = 'integer' AND unit_minor BETWEEN 1 AND 100000), filled_at INTEGER NOT NULL, CHECK(buy_order_id != sell_order_id) );
CREATE INDEX IF NOT EXISTS idx_market_orders_book ON market_orders(city_id, good, side, created_at);
CREATE INDEX IF NOT EXISTS idx_market_orders_citizen ON market_orders(citizen_id, good);
CREATE INDEX IF NOT EXISTS idx_market_trades_buy ON market_trades(buy_order_id);
CREATE INDEX IF NOT EXISTS idx_market_trades_sell ON market_trades(sell_order_id);
CREATE VIEW IF NOT EXISTS market_open_orders AS SELECT * FROM (SELECT o.*, o.qty - COALESCE((SELECT SUM(t.qty) FROM market_trades t WHERE t.buy_order_id = o.id), 0) - COALESCE((SELECT SUM(t.qty) FROM market_trades t WHERE t.sell_order_id = o.id), 0) AS remaining FROM market_orders o WHERE NOT EXISTS (SELECT 1 FROM market_order_cancellations x WHERE x.order_id = o.id)) r WHERE remaining > 0;
INSERT OR IGNORE INTO market_goods (good, label, unit, perishable, shelf_life_days) VALUES ('fruit', 'Fruit', 'basket', 1, 3);
INSERT OR IGNORE INTO market_goods (good, label, unit, perishable, shelf_life_days) VALUES ('meat', 'Meat', 'cut', 1, 2);
INSERT OR IGNORE INTO market_goods (good, label, unit, perishable, shelf_life_days) VALUES ('wood', 'Wood', 'bundle', 0, NULL);
DROP VIEW IF EXISTS citizen_wallet_balances;
DROP VIEW IF EXISTS citizen_inventory_balances;
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
    - COALESCE((SELECT SUM(remaining) FROM market_open_orders WHERE citizen_id=c.clerk_user_id AND side='sell' AND good=c.item),0) AS quantity
  FROM (
    SELECT clerk_user_id,item FROM shift_settlements
    UNION SELECT clerk_user_id,item FROM citizen_economy_events
    UNION SELECT clerk_user_id,'food' AS item FROM starter_food_grants
    UNION SELECT buyer_id AS clerk_user_id,item FROM player_fills
    UNION SELECT citizen_id AS clerk_user_id,good AS item FROM market_orders WHERE citizen_id IS NOT NULL
  ) c;
INSERT OR IGNORE INTO economy_migrations (id) VALUES ('market-orders-v1');
