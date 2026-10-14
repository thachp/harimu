import type {GameDatabase} from './database-contract';
export const marketSeeds = [
  ['food', 'Food', 150, 100, 100],
  ['materials', 'Materials', 300, 200, 40],
  ['knowledge', 'Knowledge', 500, 350, 20],
] as const;
export const starterFood = 2;
export const mealFood = 2;
export const mealCapacity = 4;
export type MarketState = {
  available: boolean;
  merchantCashMinor: number;
  quotes: { item: string; label: string; buyMinor: number; sellMinor: number; stock: number }[];
  mealReadyAt: string | null;
  mealFood: number;
  mealCapacity: number;
  mealIntervalSeconds: number;
  householdRecord?: { starterFoodGranted: number; lastMealAt: string | null };
};
export type MarketCommand = { requestId: string; action: 'market-trade' | 'household-meal';
  side?: 'buy' | 'sell'; item?: string; quantity?: number };
export const marketItemsSchema = `CREATE TABLE IF NOT EXISTS market_items (
  item TEXT PRIMARY KEY, label TEXT NOT NULL,
  buy_minor INTEGER NOT NULL CHECK(typeof(buy_minor) = 'integer' AND buy_minor > 0),
  sell_minor INTEGER NOT NULL CHECK(typeof(sell_minor) = 'integer' AND sell_minor > 0 AND sell_minor < buy_minor),
  initial_stock INTEGER NOT NULL CHECK(typeof(initial_stock) = 'integer' AND initial_stock >= 0)
)`;
export const starterSchema = `CREATE TABLE IF NOT EXISTS starter_food_grants (
  clerk_user_id TEXT PRIMARY KEY REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK(quantity = 2)
)`;
export const marketEventsSchema = `CREATE TABLE IF NOT EXISTS citizen_economy_events (
  id TEXT PRIMARY KEY,
  clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('buy', 'sell', 'meal')),
  item TEXT NOT NULL,
  quantity_delta INTEGER NOT NULL CHECK(typeof(quantity_delta) = 'integer'),
  wallet_delta INTEGER NOT NULL CHECK(typeof(wallet_delta) = 'integer'),
  occurred_at INTEGER NOT NULL,
  capacity_applied INTEGER NOT NULL DEFAULT 0 CHECK(capacity_applied IN (0, 1)),
  CHECK((kind = 'buy' AND quantity_delta BETWEEN 1 AND 10 AND wallet_delta < 0)
    OR (kind = 'sell' AND quantity_delta BETWEEN -10 AND -1 AND wallet_delta > 0)
    OR (kind = 'meal' AND item = 'food' AND quantity_delta = -2 AND wallet_delta = 0))
)`;
export const walletViewSql = `CREATE VIEW IF NOT EXISTS citizen_wallet_balances AS
  SELECT c.clerk_user_id,
    COALESCE((SELECT SUM(wage_minor) FROM shift_settlements WHERE clerk_user_id = c.clerk_user_id), 0)
    + COALESCE((SELECT SUM(wallet_delta) FROM citizen_economy_events WHERE clerk_user_id = c.clerk_user_id), 0)
    - COALESCE((SELECT SUM(spark_minor) FROM citizen_tessera_exchanges WHERE clerk_user_id = c.clerk_user_id), 0)
    + COALESCE((SELECT SUM(amount_minor) FROM player_fills WHERE seller_id = c.clerk_user_id), 0)
    - COALESCE((SELECT SUM(amount_minor) FROM player_fills WHERE buyer_id = c.clerk_user_id), 0)
    + COALESCE((SELECT SUM(t.qty * t.unit_minor) FROM market_trades t JOIN market_orders o ON o.id = t.sell_order_id WHERE o.citizen_id = c.clerk_user_id), 0)
    - COALESCE((SELECT SUM(t.qty * t.unit_minor) FROM market_trades t JOIN market_orders o ON o.id = t.buy_order_id WHERE o.citizen_id = c.clerk_user_id), 0)
    - COALESCE((SELECT SUM(remaining * limit_unit_minor) FROM market_open_orders WHERE citizen_id = c.clerk_user_id AND side = 'buy'), 0) AS balance
  FROM citizens c`;
export const inventoryViewSql = `CREATE VIEW IF NOT EXISTS citizen_inventory_balances AS
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
  ) c`;
export const merchantViewSql = `CREATE VIEW IF NOT EXISTS merchant_inventory_balances AS
  SELECT m.*, m.initial_stock + CASE WHEN m.item='food' THEN COALESCE((SELECT SUM(food_quantity) FROM government_policy_executions),0) ELSE 0 END - COALESCE((SELECT SUM(quantity_delta)
    FROM citizen_economy_events WHERE item = m.item AND kind IN ('buy','sell')), 0) AS stock
  FROM market_items m`;
export const merchantCashSql = `CREATE VIEW IF NOT EXISTS merchant_cash_balance AS
  SELECT initial_minor - COALESCE((SELECT SUM(wallet_delta) FROM citizen_economy_events), 0) AS balance
  FROM economy_funds WHERE id = 'kindle-merchant'`;
export const starterGrantSql = `INSERT OR IGNORE INTO starter_food_grants (clerk_user_id, quantity)
  SELECT clerk_user_id, 2 FROM citizens WHERE clerk_user_id = ? AND nation_id = 'kindle'`;
// Prices, cash and stock are all resolved in the same authoritative INSERT.
export const tradeSql = `INSERT INTO citizen_economy_events
  (id, clerk_user_id, kind, item, quantity_delta, wallet_delta, occurred_at)
  SELECT ?, c.clerk_user_id, ?, m.item,
    CASE WHEN ? = 'buy' THEN ? ELSE -? END,
    CASE WHEN ? = 'buy' THEN -m.buy_minor * ? ELSE m.sell_minor * ? END, ?
  FROM citizens c JOIN merchant_inventory_balances m ON m.item = ?
  JOIN citizen_wallet_balances w ON w.clerk_user_id = c.clerk_user_id
  WHERE c.clerk_user_id = ? AND c.nation_id = 'kindle'
    AND ? BETWEEN 1 AND 10 AND ? = CAST(? AS INTEGER)
    AND NOT EXISTS (SELECT 1 FROM citizen_economy_events WHERE id = ?)
    AND ((? = 'buy' AND w.balance >= m.buy_minor * ? AND m.stock >= ?)
      OR (? = 'sell' AND COALESCE((SELECT quantity FROM citizen_inventory_balances
        WHERE clerk_user_id = c.clerk_user_id AND item = m.item), 0) >= ?
        AND (SELECT balance FROM merchant_cash_balance) >= m.sell_minor * ?))`;
export const mealSql = `INSERT INTO citizen_economy_events
  (id, clerk_user_id, kind, item, quantity_delta, wallet_delta, occurred_at)
  SELECT ?, c.clerk_user_id, 'meal', 'food', -2, 0, ? FROM citizens c
  WHERE c.clerk_user_id = ? AND c.nation_id = 'kindle' AND c.capacity < 24
    AND COALESCE((SELECT quantity FROM citizen_inventory_balances WHERE clerk_user_id = c.clerk_user_id AND item = 'food'), 0) >= 2
    AND NOT EXISTS (SELECT 1 FROM citizen_economy_events WHERE id = ?)
    AND NOT EXISTS (SELECT 1 FROM citizen_economy_events WHERE clerk_user_id = c.clerk_user_id
      AND kind = 'meal' AND occurred_at > ? - ?)`;
export const mealCapacitySql = `UPDATE citizens SET capacity = MIN(24, capacity + 4)
  WHERE clerk_user_id = ? AND EXISTS (SELECT 1 FROM citizen_economy_events
    WHERE id = ? AND clerk_user_id = ? AND kind = 'meal' AND capacity_applied = 0)`;
export const mealAppliedSql = `UPDATE citizen_economy_events SET capacity_applied = 1
  WHERE id = ? AND clerk_user_id = ? AND kind = 'meal' AND capacity_applied = 0`;

export function validMarketCommand(body: Record<string, unknown>): body is Record<string, unknown> & MarketCommand {
  if (typeof body.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId)) return false;
  if (body.action === 'household-meal') return true;
  return body.action === 'market-trade' && (body.side === 'buy' || body.side === 'sell')
    && marketSeeds.some(([id]) => id === body.item) && Number.isSafeInteger(body.quantity)
    && (body.quantity as number) >= 1 && (body.quantity as number) <= 10;
}
export async function executeMarketCommand(db: GameDatabase, userId: string, command: MarketCommand, now: number, interval: number) {
  const expectedKind = command.action === 'household-meal' ? 'meal' : command.side;
  const receipt = () => db.prepare('SELECT clerk_user_id, kind, item, quantity_delta FROM citizen_economy_events WHERE id = ?')
    .bind(command.requestId).first<{ clerk_user_id: string; kind: string; item: string; quantity_delta: number }>();
  const matches = (row: Awaited<ReturnType<typeof receipt>>) => row?.clerk_user_id === userId
    && row.kind === expectedKind && (expectedKind === 'meal' || (row.item === command.item && Math.abs(row.quantity_delta) === command.quantity));
  const existing = await receipt();
  if (existing) return matches(existing) ? { status: 200, replayed: true } : { status: 409, error: 'Request identifier already used. Refresh your account.' };
  if (command.action === 'household-meal') {
    await db.batch([
      db.prepare(mealSql).bind(command.requestId, now, userId, command.requestId, now, interval),
      db.prepare(mealCapacitySql).bind(userId, command.requestId, userId),
      db.prepare(mealAppliedSql).bind(command.requestId, userId),
    ]);
  } else {
    const { side, quantity, item, requestId } = command;
    await db.prepare(tradeSql).bind(requestId, side, side, quantity, quantity, side, quantity, quantity, now,
      item, userId, quantity, quantity, quantity, requestId, side, quantity, quantity, side, quantity, quantity).run();
  }
  const completed = await receipt();
  return matches(completed) ? { status: 200 } : { status: 409, error: command.action === 'household-meal'
    ? 'Meal unavailable: check food, capacity, Kindle citizenship and the meal timer.'
    : 'Trade unavailable: check funds, stock, quantity and Kindle citizenship.' };
}
export async function readMarket(db: GameDatabase, userId: string, interval: number): Promise<MarketState> {
  const [citizen, cash, quotes, lastMeal, starterGrant] = await Promise.all([
    db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id = ?').bind(userId).first<{ nation_id: string | null }>(),
    db.prepare("SELECT balance FROM merchant_cash_balance WHERE EXISTS(SELECT 1 FROM citizens WHERE clerk_user_id=? AND nation_id='kindle')").bind(userId).first<{ balance: number }>(),
    db.prepare("SELECT item, label, buy_minor, sell_minor, stock FROM merchant_inventory_balances WHERE EXISTS(SELECT 1 FROM citizens WHERE clerk_user_id=? AND nation_id='kindle') ORDER BY buy_minor").bind(userId).all<{
      item: string; label: string; buy_minor: number; sell_minor: number; stock: number;
    }>(),
    db.prepare("SELECT MAX(occurred_at) AS last_meal FROM citizen_economy_events WHERE clerk_user_id = ? AND kind = 'meal'")
      .bind(userId).first<{ last_meal: number | null }>(),
    db.prepare('SELECT quantity FROM starter_food_grants WHERE clerk_user_id = ?')
      .bind(userId).first<{ quantity: number }>(),
  ]);
  const available=citizen?.nation_id === 'kindle';
  return { available, merchantCashMinor: available ? cash?.balance ?? 0 : 0,
    quotes: available ? quotes.results.map((r) => ({ item: r.item, label: r.label, buyMinor: r.buy_minor, sellMinor: r.sell_minor, stock: r.stock })) : [],
    mealReadyAt: lastMeal?.last_meal == null ? null : new Date((lastMeal.last_meal + interval) * 1000).toISOString(),
    mealFood, mealCapacity, mealIntervalSeconds: interval,
    householdRecord: { starterFoodGranted: starterGrant?.quantity ?? 0,
      lastMealAt: lastMeal?.last_meal == null ? null : new Date(lastMeal.last_meal * 1000).toISOString() } };
}
