/**
 * Market MVP (#195): goods catalog and the city order book data model.
 *
 * Event-sourced like player_fills: orders, cancellations and trades are rows; balances are derived by the
 * citizen_wallet_balances / citizen_inventory_balances views in lib/market.ts. There is no separate ledger table.
 * - Open buy orders reserve cash: remaining qty × limit_unit_minor leaves the wallet until filled or cancelled.
 * - Open sell orders reserve goods: remaining qty leaves inventory until filled or cancelled.
 * - A trade moves qty × unit_minor from the buy order's citizen to the sell order's citizen, and qty of the good
 *   the other way. NPC sides (npc_id) are funded from economy_funds and are not in citizen views (#198).
 * Placement, matching and settlement are #197. Production is #196, spoilage #199.
 *
 * Decision (#195): fruit and meat do NOT count as `food` for household-meal in this PR. Meals keep using `food`
 * so existing balances, starter grants and Korund/Aurelle rations are unchanged. Revisit with #196/#199.
 */
export type MarketGood = 'fruit' | 'meat' | 'wood';
export type MarketGoodInfo = { good: MarketGood; label: string; unit: string; perishable: boolean; shelfLifeDays: number | null };
/** Shelf life is in game days. [ASSUMPTION] fruit 3, meat 2, wood never spoils. */
export const marketGoods: readonly MarketGoodInfo[] = [
  { good: 'fruit', label: 'Fruit', unit: 'basket', perishable: true, shelfLifeDays: 3 },
  { good: 'meat', label: 'Meat', unit: 'cut', perishable: true, shelfLifeDays: 2 },
  { good: 'wood', label: 'Wood', unit: 'bundle', perishable: false, shelfLifeDays: null },
] as const;
export const isMarketGood = (value: unknown): value is MarketGood => marketGoods.some(g => g.good === value);
export const marketOrderLimits = { maxQty: 1000, maxUnitMinor: 100000 } as const;

export const marketGoodsSchema = `CREATE TABLE IF NOT EXISTS market_goods (
  good TEXT PRIMARY KEY CHECK(good IN ('fruit','meat','wood')),
  label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 32),
  unit TEXT NOT NULL CHECK(length(unit) BETWEEN 1 AND 16),
  perishable INTEGER NOT NULL CHECK(perishable IN (0, 1)),
  shelf_life_days INTEGER CHECK((perishable = 1 AND typeof(shelf_life_days) = 'integer' AND shelf_life_days BETWEEN 1 AND 365) OR (perishable = 0 AND shelf_life_days IS NULL))
)`;
export const marketOrdersSchema = `CREATE TABLE IF NOT EXISTS market_orders (
  id TEXT PRIMARY KEY,
  city_id TEXT NOT NULL CHECK(length(city_id) BETWEEN 1 AND 64),
  citizen_id TEXT REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
  npc_id TEXT CHECK(npc_id IS NULL OR length(npc_id) BETWEEN 1 AND 64),
  side TEXT NOT NULL CHECK(side IN ('buy', 'sell')),
  good TEXT NOT NULL REFERENCES market_goods(good),
  qty INTEGER NOT NULL CHECK(typeof(qty) = 'integer' AND qty BETWEEN 1 AND 1000),
  limit_unit_minor INTEGER NOT NULL CHECK(typeof(limit_unit_minor) = 'integer' AND limit_unit_minor BETWEEN 1 AND 100000),
  created_at INTEGER NOT NULL,
  CHECK((citizen_id IS NULL) != (npc_id IS NULL))
)`;
export const marketCancellationsSchema = `CREATE TABLE IF NOT EXISTS market_order_cancellations (
  request_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES market_orders(id) ON DELETE CASCADE,
  cancelled_at INTEGER NOT NULL
)`;
export const marketTradesSchema = `CREATE TABLE IF NOT EXISTS market_trades (
  id TEXT PRIMARY KEY,
  buy_order_id TEXT NOT NULL REFERENCES market_orders(id) ON DELETE CASCADE,
  sell_order_id TEXT NOT NULL REFERENCES market_orders(id) ON DELETE CASCADE,
  good TEXT NOT NULL REFERENCES market_goods(good),
  qty INTEGER NOT NULL CHECK(typeof(qty) = 'integer' AND qty BETWEEN 1 AND 1000),
  unit_minor INTEGER NOT NULL CHECK(typeof(unit_minor) = 'integer' AND unit_minor BETWEEN 1 AND 100000),
  filled_at INTEGER NOT NULL,
  CHECK(buy_order_id != sell_order_id)
)`;
export const marketIndexes = [
  'CREATE INDEX IF NOT EXISTS idx_market_orders_book ON market_orders(city_id, good, side, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_market_orders_citizen ON market_orders(citizen_id, good)',
  'CREATE INDEX IF NOT EXISTS idx_market_trades_buy ON market_trades(buy_order_id)',
  'CREATE INDEX IF NOT EXISTS idx_market_trades_sell ON market_trades(sell_order_id)',
];
/** Remaining qty per order: 0 once cancelled, otherwise qty minus fills. Only rows with remaining > 0 are open. */
export const marketOpenOrdersView = `CREATE VIEW IF NOT EXISTS market_open_orders AS
  SELECT * FROM (SELECT o.*, o.qty
    - COALESCE((SELECT SUM(t.qty) FROM market_trades t WHERE t.buy_order_id = o.id), 0)
    - COALESCE((SELECT SUM(t.qty) FROM market_trades t WHERE t.sell_order_id = o.id), 0) AS remaining
  FROM market_orders o WHERE NOT EXISTS (SELECT 1 FROM market_order_cancellations x WHERE x.order_id = o.id)) r
  WHERE remaining > 0`;
export const marketSchemas = [marketGoodsSchema, marketOrdersSchema, marketCancellationsSchema, marketTradesSchema, ...marketIndexes, marketOpenOrdersView];
export const marketGoodsSeedSql = marketGoods.map(g =>
  `INSERT OR IGNORE INTO market_goods (good, label, unit, perishable, shelf_life_days) VALUES ('${g.good}', '${g.label}', '${g.unit}', ${g.perishable ? 1 : 0}, ${g.shelfLifeDays ?? 'NULL'})`);
