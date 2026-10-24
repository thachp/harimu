import type { GameDatabase } from './database-contract';
import { isMissingRelation, tolerate } from './db-errors';
import { kindleTreasuryBalanceSql } from './economy';
import { parked } from './async-limits'; // #679
import { charterMonthCap, charterYearCap, gameMonth, gameYearOfMonth, issuanceAmount, issuanceBpOk, priceIndex, reserveBoardPick, routeCapBp, sparkConfig, sparkRequestIdOk, type IssuanceRoute, type WeekSample } from './spark-supply-rules';
export * from './spark-supply-rules';

/** #431: Kindle Spark money supply and Price Index PoC behind HARIMU_SPARK_SUPPLY_ENABLED (default "false"). Canon and numbers: lib/spark-supply-rules.ts.
 *  The money supply is a figure kept as immutable issuance rows (no mutable total): one opening `seed` row (the Spark already in Kindle citizens' wallets plus the
 *  Kindle treasury, taken once) and one row per issuance. Issuance is written only by server code: `issueSpark` (the one place the per-route caps and the Charter
 *  Limit are enforced, for any route) and the scheduled Worker (`runSparkCron`, the AI Reserve Board's fixed monthly rule). No route calls either and no GET writes.
 *  The Price Index is derived on read from the stored rows and shifts settled. PoC: issuing Spark moves the published figure only; wallets, wages and prices do not react yet.
 *  Out of scope: private banks, loans, stock market, the Assembly stimulus vote UI, redenomination, exchange-rate drift, other nations' printing authorities. */
export const sparkIssuanceSchemas = [
  `CREATE TABLE IF NOT EXISTS spark_issuances (
 id TEXT PRIMARY KEY,
 request_id TEXT NOT NULL UNIQUE,
 game_month INTEGER NOT NULL CHECK(game_month >= 1),
 route TEXT NOT NULL CHECK(route IN ('seed','normal','emergency')),
 basis_points INTEGER NOT NULL CHECK(basis_points BETWEEN 0 AND 1000),
 amount_minor INTEGER NOT NULL CHECK(amount_minor >= 0),
 supply_before_minor INTEGER NOT NULL CHECK(supply_before_minor >= 0),
 supply_after_minor INTEGER NOT NULL CHECK(supply_after_minor = supply_before_minor + amount_minor),
 issued_by TEXT NOT NULL CHECK(length(issued_by) BETWEEN 1 AND 60),
 issued_at INTEGER NOT NULL,
 prev_id TEXT REFERENCES spark_issuances(id),
 CHECK((route = 'seed' AND prev_id IS NULL) OR (route <> 'seed' AND prev_id IS NOT NULL)),
 CHECK(route <> 'seed' OR (id = 'spark-seed' AND basis_points = 0 AND supply_before_minor = 0)),
 CHECK(route <> 'normal' OR basis_points <= 300),
 CHECK(route <> 'emergency' OR basis_points >= 1)
)`,
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_spark_issuances_one_successor ON spark_issuances(prev_id)',
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_spark_issuances_one_normal_per_month ON spark_issuances(game_month) WHERE route = 'normal'",
  'CREATE INDEX IF NOT EXISTS idx_spark_issuances_month ON spark_issuances(game_month)',
];

type Row = { id: string; request_id: string; game_month: number; route: string; basis_points: number; amount_minor: number; supply_before_minor: number; supply_after_minor: number; issued_by: string; issued_at: number; prev_id: string | null };
const columns = 'id,request_id,game_month,route,basis_points,amount_minor,supply_before_minor,supply_after_minor,issued_by,issued_at,prev_id';
export const reserveBoardName = 'Reserve Board';
export type SparkIssuance = { id: string; gameMonth: number; route: IssuanceRoute; basisPoints: number; amountMinor: number; supplyBeforeMinor: number; supplyAfterMinor: number; issuedBy: string; issuedAt: number };
const publicIssuance = (row: Row): SparkIssuance => ({ id: row.id, gameMonth: Number(row.game_month), route: row.route as IssuanceRoute, basisPoints: Number(row.basis_points), amountMinor: Number(row.amount_minor),
  supplyBeforeMinor: Number(row.supply_before_minor), supplyAfterMinor: Number(row.supply_after_minor), issuedBy: row.issued_by, issuedAt: Number(row.issued_at) });
const fail = (status: 400 | 403 | 409, reason: string, error: string) => ({ ok: false as const, status, reason, error });

/** What Kindle publishes (docs 12.6): read-only, derived. `lastIssuance` is the latest issuance row (the seed is not an issuance). */
export type ReserveBoard = { moneySupplyMinor: number; lastIssuance: { gameMonth: number; route: IssuanceRoute; amountMinor: number; issuedAt: number } | null; priceIndex: number };

async function worldEpoch(db: GameDatabase): Promise<number> {
  const clock = await db.prepare("SELECT epoch_seconds FROM world_clock WHERE id='main'").first<{ epoch_seconds: number }>().catch(tolerate(isMissingRelation, null));
  return clock ? Number(clock.epoch_seconds) : 0;
}
/** The Spark in Kindle citizens' wallets plus the Kindle treasury, right now (read-only). Used once, to seed the opening row, and to show a figure before the first run. */
async function liveSupply(db: GameDatabase): Promise<number> {
  const row = await db.prepare(`SELECT COALESCE((SELECT SUM(w.balance) FROM citizen_wallet_balances w JOIN citizens c ON c.clerk_user_id = w.clerk_user_id WHERE c.nation_id = 'kindle'), 0)
    + COALESCE((SELECT balance FROM (${kindleTreasuryBalanceSql}) t), 0) AS supply`).first<{ supply: number }>().catch(tolerate(isMissingRelation, null));
  return Math.max(0, Math.trunc(Number(row?.supply ?? 0)));
}
/** The newest row is the one nothing follows: every row names the row it follows (`prev_id`, unique), so the rows form one chain. */
const latestRow = (db: GameDatabase) => db.prepare(`SELECT ${columns} FROM spark_issuances t WHERE NOT EXISTS (SELECT 1 FROM spark_issuances n WHERE n.prev_id = t.id)`).first<Row>().catch(tolerate(isMissingRelation, null));
const seedRow = (db: GameDatabase) => db.prepare(`SELECT ${columns} FROM spark_issuances WHERE id='spark-seed'`).first<Row>().catch(tolerate(isMissingRelation, null));

/** Writes the opening supply row once (idempotent by its fixed id). */
async function ensureSeed(db: GameDatabase, month: number, now: number): Promise<Row> {
  const existing = await seedRow(db);
  if (existing) return existing;
  const supply = await liveSupply(db);
  await db.prepare(`INSERT INTO spark_issuances (${columns}) VALUES ('spark-seed','spark-seed',?,'seed',0,?,0,?,?,?,NULL) ON CONFLICT DO NOTHING`).bind(month, supply, supply, reserveBoardName, now).run();
  return (await seedRow(db))!;
}

/** Read-only. Flag off: the caller does not call this. A database without migration 0043, or before the first scheduled run, shows the live supply and the base index. */
export async function readReserveBoard(db: GameDatabase, now: number): Promise<ReserveBoard> {
  // #679: the reads that only matter once the seed exists start alongside the seed read (parked, so a database without the seed or migration 0043 leaves no
  // unhandled rejection; they are awaited only when the seed exists). Seeded: one round trip instead of five.
  const reads = parked(Promise.all([latestRow(db),
    db.prepare(`SELECT ${columns} FROM spark_issuances WHERE route <> 'seed' ORDER BY game_month DESC, supply_after_minor DESC, issued_at DESC, id DESC LIMIT 1`).first<Row>(), worldEpoch(db),
    db.prepare(`SELECT ${columns} FROM spark_issuances ORDER BY issued_at, supply_after_minor, id`).all<Row>(),
    // #679 slice 4: the window's settled shifts, from a bound no later than the window's first week (that week starts after now minus the window), so this needs neither the
    // seed nor the epoch; weeks before the window are ignored below. Shift settlements are append-only and this request writes none, so the early read is not stale.
    db.prepare('SELECT settled_at FROM shift_settlements WHERE settled_at >= ?').bind(new Date((now - sparkConfig.priceWindowWeeks * sparkConfig.gameWeekSeconds) * 1000).toISOString())
      .all<{ settled_at: string }>().catch(tolerate(isMissingRelation, { results: [] as { settled_at: string }[] }))]));
  const seed = await seedRow(db);
  if (!seed) return { moneySupplyMinor: await liveSupply(db), lastIssuance: null, priceIndex: sparkConfig.priceBase };
  const [early, last, epoch, { results: earlyRows }, { results: settled }] = await reads;
  // The early reads may predate the seed (first write) or each other. Serially, the latest row was read after the seed and the full rows after it, so
  // re-read in that order when the early latest is missing or the early rows lack it; rows are append-only, so the early ones are otherwise no older.
  const latest = early ?? await latestRow(db);
  const rows = latest && earlyRows.some(row => row.id === latest.id) ? earlyRows : (await db.prepare(`SELECT ${columns} FROM spark_issuances ORDER BY issued_at, supply_after_minor, id`).all<Row>()).results;
  const supply = Number(latest!.supply_after_minor);
  // Weekly samples for the window, ending now: the supply at each week's end (from the rows) and the shifts settled in it (Kindle's shift ledger).
  const weekSeconds = sparkConfig.gameWeekSeconds, nowWeek = Math.floor((now - epoch) / weekSeconds), seedWeek = Math.floor((Number(seed.issued_at) - epoch) / weekSeconds);
  const firstWeek = Math.max(seedWeek, nowWeek - sparkConfig.priceWindowWeeks + 1);
  const output = new Map<number, number>();
  for (const shift of settled) { const week = Math.floor((Date.parse(shift.settled_at) / 1000 - epoch) / weekSeconds); output.set(week, (output.get(week) ?? 0) + 1); }
  const weeks: WeekSample[] = [];
  for (let week = firstWeek; week <= nowWeek; week++) {
    const end = epoch + (week + 1) * weekSeconds;
    let at = Number(seed.supply_after_minor);
    for (const row of rows) if (Number(row.issued_at) < end) at = Number(row.supply_after_minor); else break;
    weeks.push({ supply: at, output: output.get(week) ?? 0 });
  }
  return { moneySupplyMinor: supply, priceIndex: priceIndex(weeks, Number(seed.supply_after_minor)),
    lastIssuance: last ? { gameMonth: Number(last.game_month), route: last.route as IssuanceRoute, amountMinor: Number(last.amount_minor), issuedAt: Number(last.issued_at) } : null };
}

export type IssueCommand = { requestId: string; route: IssuanceRoute; basisPoints: number; issuedBy?: string };
/** Server-side only, and the ONE place the limits are enforced for any route. `normal` is the Reserve Board's monthly issuance (0-3%, once per game month); `emergency`
 *  is the Assembly 2/3 stimulus (1-10%), a stub until that vote exists. Either way the Charter Limit applies: at most 15% of the month-start supply in a game month and 30% of the
 *  year-start supply in a game year, counted across every route. Over the limit is rejected and nothing is written. The cap check is part of the insert statement, so racing
 *  requests cannot both pass. Idempotent per request id; reusing one with a different issuance is `request_reused`. */
export async function issueSpark(db: GameDatabase, command: IssueCommand, now: number, options: { enabled: boolean }) {
  if (!options.enabled) return fail(403, 'disabled', 'Spark issuance is not open yet.');
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid authoritative world time.');
  if (!sparkRequestIdOk(command.requestId)) return fail(400, 'bad_request', 'A request id is required.');
  if (routeCapBp(command.route) === null) return fail(400, 'bad_route', 'An issuance is either normal or emergency.');
  if (!issuanceBpOk(command.route, command.basisPoints)) return fail(400, 'over_cap', command.route === 'normal' ? 'The Reserve Board may issue up to its monthly cap.' : 'An emergency stimulus is limited to its own cap.');
  const issuedBy = (command.issuedBy ?? reserveBoardName).trim();
  if (!issuedBy || issuedBy.length > 60 || /[\u0000-\u001f\u007f]/.test(issuedBy)) return fail(400, 'bad_request', 'The issuing body must be named.');
  const same = (row: Row) => row.route === command.route && Number(row.basis_points) === command.basisPoints;
  const prior = await db.prepare(`SELECT ${columns} FROM spark_issuances WHERE request_id=?`).bind(command.requestId).first<Row>();
  if (prior) return same(prior) ? { ok: true as const, replay: true as const, issuance: publicIssuance(prior) } : fail(409, 'request_reused', 'That request id was already used for a different issuance.');
  const month = gameMonth(now, await worldEpoch(db)), year = gameYearOfMonth(month), yearFirst = (year - 1) * sparkConfig.gameYearMonths + 1, yearLast = year * sparkConfig.gameYearMonths;
  // Every row follows exactly one earlier row (unique `prev_id`), so two issuances racing from the same supply cannot both land; the loser re-checks the limits against the winner.
  for (let attempt = 0; attempt < 5; attempt++) {
    const seed = await ensureSeed(db, month, now), latest = (await latestRow(db))!;
    const before = Number(latest.supply_after_minor), amount = issuanceAmount(before, command.basisPoints);
    const startOf = async (firstMonth: number) => { // the supply when that game month or year began: the last row before it, else the opening supply
      const row = await db.prepare('SELECT supply_after_minor FROM spark_issuances WHERE game_month < ? ORDER BY game_month DESC, supply_after_minor DESC, issued_at DESC, id DESC LIMIT 1').bind(firstMonth).first<{ supply_after_minor: number }>();
      return Number(row?.supply_after_minor ?? seed.supply_after_minor);
    };
    const monthCap = charterMonthCap(await startOf(month)), yearCap = charterYearCap(await startOf(yearFirst));
    const id = `spark-${command.requestId}`;
    await db.prepare(`INSERT INTO spark_issuances (${columns})
      SELECT ?,?,?,?,?,?,?,?,?,?,?
      WHERE COALESCE((SELECT SUM(amount_minor) FROM spark_issuances WHERE route <> 'seed' AND game_month = ?), 0) + ? <= ?
        AND COALESCE((SELECT SUM(amount_minor) FROM spark_issuances WHERE route <> 'seed' AND game_month BETWEEN ? AND ?), 0) + ? <= ?
      ON CONFLICT DO NOTHING`)
      .bind(id, command.requestId, month, command.route, command.basisPoints, amount, before, before + amount, issuedBy, now, latest.id, month, amount, monthCap, yearFirst, yearLast, amount, yearCap).run();
    const saved = await db.prepare(`SELECT ${columns} FROM spark_issuances WHERE request_id=?`).bind(command.requestId).first<Row>();
    if (saved) return same(saved) ? { ok: true as const, issuance: publicIssuance(saved) } : fail(409, 'request_reused', 'That request id was already used for a different issuance.');
    const newest = await latestRow(db);
    if (newest && newest.id !== latest.id) continue;
    if (command.route === 'normal' && (await db.prepare("SELECT 1 AS found FROM spark_issuances WHERE route='normal' AND game_month=?").bind(month).first()))
      return fail(409, 'already_issued_this_month', 'The Reserve Board has already issued this game month.');
    return fail(409, 'charter_limit', 'That issuance would pass the Charter Limit. No Spark was created.');
  }
  return fail(409, 'busy', 'Another issuance is in progress. Try again.');
}

/** The scheduled Worker's AI Reserve Board (never a read): once a game month the fixed rule in `reserveBoardPick` issues 0-3% of the money supply. Idempotent: the request id is derived
 *  from the game month, so repeated or overlapping cron runs issue at most once. Flag off: nothing happens. */
export async function runSparkCron(db: GameDatabase, now: number, options: { enabled: boolean }) {
  if (!options.enabled) return { status: 'disabled' as const };
  const month = gameMonth(now, await worldEpoch(db));
  await ensureSeed(db, month, now);
  const result = await issueSpark(db, { requestId: `reserve-board-month-${month}`, route: 'normal', basisPoints: reserveBoardPick(month) }, now, { enabled: true });
  return result.ok && !('replay' in result) ? { status: 'issued' as const, issuance: result.issuance } : { status: 'idle' as const };
}
