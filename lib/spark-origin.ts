import type { GameDatabase } from './database-contract';

/** #465: origin of Spark credits. Legacy rows with no entry stay `unknown` (fail-closed). Never backfill them as earned. */
export const sparkOrigins = ['earned', 'purchased', 'unknown'] as const;
export type SparkOrigin = (typeof sparkOrigins)[number];
export type SparkLots = Record<SparkOrigin, number>;
/** Sinks and transfers spend ineligible Spark first. A portion keeps its origin and is never rewritten to earned. */
export const sparkDrawOrder = ['unknown', 'purchased', 'earned'] as const;

/**
 * Issuance reason → origin. Absent reasons are unknown.
 * wage: shift_settlements (verified work). The income-tax row debits that same earned origin.
 * purchased-spark: no production path mints this today; a purchase must not be labeled earned.
 * npc-market-sell: Kindle merchant cash for goods, not wages.
 * npc-order-buy: an NPC bid paying a citizen.
 * savings-shield: treasury welfare credit, not wages.
 */
export const sparkCreditOrigin: Record<string, SparkOrigin> = {
  wage: 'earned',
  'purchased-spark': 'purchased',
  'npc-market-sell': 'unknown',
  'npc-order-buy': 'unknown',
  'savings-shield': 'unknown',
};

export const originForCredit = (reason: string): SparkOrigin => sparkCreditOrigin[reason] ?? 'unknown';
/** Only earned Spark would qualify for a later conversion. The exchange stays disabled (Decision 111). */
export const originQualifiesForConversion = (origin: SparkOrigin): boolean => origin === 'earned';
export const convertibleSparkMinor = (lots: SparkLots): number => Math.max(0, Math.trunc(lots.earned || 0));

export const sparkOriginSchemas = [
  `CREATE TABLE IF NOT EXISTS spark_origin_entries (
  id TEXT PRIMARY KEY,
  clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
  origin TEXT NOT NULL CHECK(origin IN ('earned','purchased','unknown')),
  delta_minor INTEGER NOT NULL CHECK(delta_minor <> 0),
  reason TEXT NOT NULL,
  source_id TEXT NOT NULL,
  occurred_at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS idx_spark_origin_entries_citizen ON spark_origin_entries(clerk_user_id)',
  'CREATE INDEX IF NOT EXISTS idx_spark_origin_entries_source ON spark_origin_entries(source_id)',
] as const;

const empty = (): SparkLots => ({ earned: 0, purchased: 0, unknown: 0 });
const sumLots = (lots: SparkLots) => lots.earned + lots.purchased + lots.unknown;
const isOrigin = (value: string): value is SparkOrigin => value === 'earned' || value === 'purchased' || value === 'unknown';

export function splitTransfer(lots: SparkLots, amount: number): { origin: SparkOrigin; amount: number }[] {
  if (!Number.isSafeInteger(amount) || amount <= 0) return [];
  const parts: { origin: SparkOrigin; amount: number }[] = [];
  let left = amount;
  for (const origin of sparkDrawOrder) {
    const take = Math.min(left, Math.max(0, Math.trunc(lots[origin] || 0)));
    if (take > 0) { parts.push({ origin, amount: take }); left -= take; }
  }
  return parts;
}

type Entry = { role: string; origin: SparkOrigin; delta: number; reason: string };
type Row = Entry & { userId: string };

async function seen(db: GameDatabase, sourceId: string) {
  return !!(await db.prepare('SELECT 1 AS x FROM spark_origin_entries WHERE source_id=? LIMIT 1').bind(sourceId).first());
}

async function position(db: GameDatabase, userId: string) {
  const lots = empty();
  const grouped = await db.prepare('SELECT origin, SUM(delta_minor) AS n FROM spark_origin_entries WHERE clerk_user_id=? GROUP BY origin').bind(userId).all<{ origin: string; n: number }>();
  for (const row of grouped.results ?? []) if (isOrigin(row.origin)) lots[row.origin] = Number(row.n);
  const held = await db.prepare(`SELECT COALESCE((SELECT balance FROM citizen_wallet_balances WHERE clerk_user_id=?),0)
    + COALESCE((SELECT SUM(remaining * limit_unit_minor) FROM market_open_orders WHERE citizen_id=? AND side='buy'),0) AS n`).bind(userId, userId).first<{ n: number }>();
  return { lots, holdings: Number(held?.n ?? 0) };
}

function withUntracked(lots: SparkLots, holdings: number): SparkLots {
  return { ...lots, unknown: lots.unknown + Math.max(0, holdings - sumLots(lots)) };
}

function debits(tracked: SparkLots, parts: { origin: SparkOrigin; amount: number }[], reason: string, role: string): Entry[] {
  const left = { ...tracked };
  const rows: Entry[] = [];
  for (const part of parts) {
    const take = Math.min(part.amount, Math.max(0, left[part.origin]));
    if (take > 0) rows.push({ role, origin: part.origin, delta: -take, reason });
    left[part.origin] -= take;
  }
  return rows;
}

async function writeAll(db: GameDatabase, sourceId: string, occurredAt: number, rows: Row[]) {
  const nonzero = rows.filter(row => row.delta !== 0);
  if (!nonzero.length) return;
  await db.batch(nonzero.map(row => db.prepare(`INSERT INTO spark_origin_entries (id,clerk_user_id,origin,delta_minor,reason,source_id,occurred_at)
    VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`).bind(`${sourceId}:${row.userId}:${row.role}:${row.origin}`, row.userId, row.origin, row.delta, row.reason, sourceId, occurredAt)));
}

/** Read-side fail-closed clamp. Lots floor at 0. Tracked Spark above holdings comes off earned first, then purchased, then unknown, so earned never exceeds holdings and the three lots sum to it (0 when holdings are negative). A missed credit still lands in unknown. */
export function clampOriginLots(lots: SparkLots, holdings: number): SparkLots {
  const held = Math.max(0, Math.trunc(Number.isFinite(holdings) ? holdings : 0));
  const out: SparkLots = { earned: Math.max(0, Math.trunc(lots.earned || 0)), purchased: Math.max(0, Math.trunc(lots.purchased || 0)), unknown: Math.max(0, Math.trunc(lots.unknown || 0)) };
  let excess = sumLots(out) - held;
  if (excess > 0) for (const origin of ['earned', 'purchased', 'unknown'] as const) { const take = Math.min(out[origin], excess); out[origin] -= take; excess -= take; }
  else if (excess < 0) out.unknown += -excess;
  return out;
}

/** Holdings by origin. Spark with no ledger row is unknown, including rows written before origin tracking. */
export async function readSparkOriginBalances(db: GameDatabase, userId: string) {
  const { lots, holdings } = await position(db, userId);
  const available = clampOriginLots(lots, holdings);
  return { earned: available.earned, purchased: available.purchased, unknown: available.unknown, total: sumLots(available) };
}

export async function recordSparkIssuance(db: GameDatabase, userId: string, amount: number, sourceId: string, reason: string, occurredAt: number) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || await seen(db, sourceId)) return;
  await writeAll(db, sourceId, occurredAt, [{ userId, role: 'issue', origin: originForCredit(reason), delta: amount, reason }]);
}

export async function recordSparkSink(db: GameDatabase, userId: string, amount: number, sourceId: string, reason: string, occurredAt: number) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || await seen(db, sourceId)) return;
  const pos = await position(db, userId);
  const parts = splitTransfer(withUntracked(pos.lots, pos.holdings + amount), amount);
  await writeAll(db, sourceId, occurredAt, debits(pos.lots, parts, reason, 'sink').map(row => ({ ...row, userId })));
}

/** Gross wage is earned. Income tax withheld from that wage debits earned and cannot retag it. */
export async function recordSettledWage(db: GameDatabase, userId: string, shiftId: string, occurredAt: number) {
  const sourceId = `wage:${shiftId}`;
  if (await seen(db, sourceId)) return;
  const wage = await db.prepare('SELECT wage_minor AS n FROM shift_settlements WHERE shift_id=? AND clerk_user_id=?').bind(shiftId, userId).first<{ n: number }>();
  if (!wage) return;
  const tax = await db.prepare('SELECT tax_minor AS n FROM shift_income_tax WHERE shift_id=? AND clerk_user_id=?').bind(shiftId, userId).first<{ n: number }>();
  const taxMinor = Number(tax?.n ?? 0);
  await writeAll(db, sourceId, occurredAt, [
    { userId, role: 'issue', origin: 'earned', delta: Number(wage.n), reason: 'wage' },
    ...(taxMinor > 0 ? [{ userId, role: 'tax', origin: 'earned' as const, delta: -taxMinor, reason: 'income-tax' }] : []),
  ]);
}

/** `gross` moves from `fromId` to `toId`. `sinkMinor` then leaves the receiver (fee or sales tax already taken from the wallet). */
export async function recordSparkTransfer(db: GameDatabase, fromId: string, toId: string, gross: number, sinkMinor: number, sourceId: string, occurredAt: number, reason: string, sinkReason: string) {
  if (!Number.isSafeInteger(gross) || gross <= 0 || sinkMinor < 0 || await seen(db, sourceId)) return;
  const [fromPos, toPos] = await Promise.all([position(db, fromId), position(db, toId)]);
  const parts = splitTransfer(withUntracked(fromPos.lots, fromPos.holdings + gross), gross);
  const received = empty();
  for (const part of parts) received[part.origin] += part.amount;
  const credited: SparkLots = { earned: toPos.lots.earned + received.earned, purchased: toPos.lots.purchased + received.purchased, unknown: toPos.lots.unknown + received.unknown };
  const priorUntracked = Math.max(0, toPos.holdings - gross + sinkMinor - sumLots(toPos.lots));
  const sinkParts = sinkMinor > 0 ? splitTransfer({ ...credited, unknown: credited.unknown + priorUntracked }, sinkMinor) : [];
  await writeAll(db, sourceId, occurredAt, [
    ...debits(fromPos.lots, parts, reason, 'out').map(row => ({ ...row, userId: fromId })),
    ...parts.map(part => ({ userId: toId, role: 'in', origin: part.origin, delta: part.amount, reason })),
    ...debits(credited, sinkParts, sinkReason, 'sink').map(row => ({ ...row, userId: toId })),
  ]);
}

export async function recordEconomyEvent(db: GameDatabase, eventId: string) {
  const sourceId = `mkt:${eventId}`;
  if (await seen(db, sourceId)) return;
  const row = await db.prepare('SELECT clerk_user_id AS user_id, wallet_delta AS delta, occurred_at AS at FROM citizen_economy_events WHERE id=?').bind(eventId).first<{ user_id: string; delta: number; at: number }>();
  if (!row || Number(row.delta) === 0) return;
  if (Number(row.delta) > 0) await recordSparkIssuance(db, row.user_id, Number(row.delta), sourceId, 'npc-market-sell', Number(row.at));
  else await recordSparkSink(db, row.user_id, -Number(row.delta), sourceId, 'npc-market-buy', Number(row.at));
}

export async function recordPlayerFill(db: GameDatabase, requestId: string, options: { salesTax?: boolean } = {}) {
  const row = await db.prepare('SELECT buyer_id, seller_id, amount_minor AS gross, filled_at AS at FROM player_fills WHERE request_id=?').bind(requestId).first<{ buyer_id: string; seller_id: string; gross: number; at: number }>();
  if (!row) return;
  // Flag off: do not read the tax table (tests pin that no sales-tax statement runs).
  const tax = options.salesTax ? await db.prepare('SELECT tax_minor AS n FROM player_fill_sales_tax WHERE request_id=?').bind(requestId).first<{ n: number }>() : null;
  await recordSparkTransfer(db, row.buyer_id, row.seller_id, Number(row.gross), Number(tax?.n ?? 0), `fill:${requestId}`, Number(row.at), 'player-fill', 'player-fill-tax');
}

/** Citizen↔citizen keeps the buyer's origin. An NPC payer is an unknown issuance. Paying an NPC is a sink. Fee and sales tax sink from the seller when those flags wrote a row. */
export async function recordOrderFill(db: GameDatabase, tradeId: string, options: { fee?: boolean; salesTax?: boolean } = {}) {
  const feeSql = options.fee ? 'COALESCE((SELECT fee_minor FROM market_trade_fees WHERE trade_id=t.id),0)' : '0';
  const taxSql = options.salesTax ? 'COALESCE((SELECT tax_minor FROM market_sales_tax WHERE trade_id=t.id),0)' : '0';
  const row = await db.prepare(`SELECT t.qty * t.unit_minor AS gross, t.filled_at AS at, b.citizen_id AS buyer, s.citizen_id AS seller,
    ${feeSql} AS fee, ${taxSql} AS tax
    FROM market_trades t JOIN market_orders b ON b.id=t.buy_order_id JOIN market_orders s ON s.id=t.sell_order_id WHERE t.id=?`).bind(tradeId).first<{ gross: number; at: number; buyer: string | null; seller: string | null; fee: number; tax: number }>();
  if (!row) return;
  const gross = Number(row.gross), sinkMinor = Number(row.fee) + Number(row.tax), at = Number(row.at), sourceId = `trade:${tradeId}`;
  if (row.buyer && row.seller) await recordSparkTransfer(db, row.buyer, row.seller, gross, sinkMinor, sourceId, at, 'order-trade', 'order-trade-sink');
  else if (row.buyer) await recordSparkSink(db, row.buyer, gross, sourceId, 'order-buy', at);
  else if (row.seller) await recordNpcPay(db, row.seller, gross, sinkMinor, sourceId, at);
}

async function recordNpcPay(db: GameDatabase, userId: string, gross: number, sinkMinor: number, sourceId: string, occurredAt: number) {
  if (await seen(db, sourceId)) return;
  const pos = await position(db, userId);
  const credited: SparkLots = { ...pos.lots, unknown: pos.lots.unknown + gross };
  const priorUntracked = Math.max(0, pos.holdings - gross + sinkMinor - sumLots(pos.lots));
  const sinkParts = sinkMinor > 0 ? splitTransfer({ ...credited, unknown: credited.unknown + priorUntracked }, sinkMinor) : [];
  await writeAll(db, sourceId, occurredAt, [
    { userId, role: 'issue', origin: 'unknown', delta: gross, reason: 'npc-order-buy' },
    ...debits(credited, sinkParts, 'order-trade-sink', 'sink').map(row => ({ ...row, userId })),
  ]);
}
