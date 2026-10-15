import type { GameDatabase } from './database-contract';

/**
 * #210 (docs 12.5 / 12.8): the real Tessera source for citizens. A Kindle citizen buys Tessera with Spark at a Commons
 * Clearing House kiosk (a licensed exchange) at the official rate. Replaces the temporary 50.00 TSR starter grant.
 * PoC: the official rate is the fixed placeholder quote (1 SPK = 0.25 TSR, lib/wallet.ts), buy-only, no kiosk fee,
 * Kindle only (unlimited in Kindle apart from the verification-tier limits of Section 20, which do not exist yet;
 * Korund is non-convertible). Behind its own flag HARIMU_TESSERA_EXCHANGE_ENABLED, default off (#626, Decision 111); HARIMU_SQUARE_PURCHASE_ENABLED is squares only.
 * Integer minor units; the SPK cost rounds up so the kiosk never mints Tessera for less than the official rate.
 */
export const kioskNations = ['kindle'] as const;
/** SPK minor units per TSR minor unit at the official rate (1 SPK = 0.25 TSR → 4 SPK per TSR). */
export const sparkPerTessera = 4;
export const kioskMinTesseraMinor = 100; // 1.00 TSR
export const kioskMaxTesseraMinor = 10000; // 100.00 TSR per exchange [ASSUMPTION]

export const tesseraExchangeSchema = `CREATE TABLE IF NOT EXISTS citizen_tessera_exchanges (
 request_id TEXT PRIMARY KEY,
 clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 nation_id TEXT NOT NULL CHECK(nation_id = 'kindle'),
 spark_minor INTEGER NOT NULL CHECK(spark_minor > 0),
 tessera_minor INTEGER NOT NULL CHECK(tessera_minor > 0),
 occurred_at INTEGER NOT NULL
)`;
export const tesseraExchangeIndex = 'CREATE INDEX IF NOT EXISTS idx_tessera_exchanges_citizen ON citizen_tessera_exchanges(clerk_user_id, occurred_at)';

/** Tessera balance for one citizen (bind the user id twice): World Registry ledger plus kiosk purchases. */
export const tesseraBalanceSql = `COALESCE((SELECT SUM(delta_minor) FROM citizen_tessera_ledger WHERE clerk_user_id=?),0)
  + COALESCE((SELECT SUM(tessera_minor) FROM citizen_tessera_exchanges WHERE clerk_user_id=?),0)`;

export function sparkCost(tesseraMinor: number): number {
  return Math.ceil(tesseraMinor * sparkPerTessera);
}

export type ExchangeCommand = { tesseraMinor: number; requestId: string };
export type ExchangeResult =
  | { ok: true; tesseraMinor: number; sparkMinor: number; boughtTesseraMinor: number; costSparkMinor: number; replay?: true }
  | { ok: false; status: 400 | 403 | 409; reason: string; error: string };
const fail = (status: 400 | 403 | 409, reason: string, error: string): ExchangeResult => ({ ok: false, status, reason, error });

export function parseExchangeCommand(body: Record<string, unknown>): ExchangeCommand | null {
  if (body.action !== 'buy-tessera') return null;
  const { tesseraMinor, requestId } = body;
  if (!Number.isSafeInteger(tesseraMinor) || (tesseraMinor as number) < kioskMinTesseraMinor || (tesseraMinor as number) > kioskMaxTesseraMinor) return null;
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(requestId)) return null;
  return { tesseraMinor: tesseraMinor as number, requestId };
}

async function balances(db: GameDatabase, userId: string) {
  const row = await db.prepare(`SELECT ${tesseraBalanceSql} AS tessera,
    COALESCE((SELECT balance FROM citizen_wallet_balances WHERE clerk_user_id=?),0) AS spark`).bind(userId, userId, userId)
    .first<{ tessera: number; spark: number }>();
  return { tesseraMinor: Number(row?.tessera ?? 0), sparkMinor: Number(row?.spark ?? 0) };
}

export async function buyTessera(db: GameDatabase, userId: string, command: ExchangeCommand, now: number, enabled: boolean): Promise<ExchangeResult> {
  if (!enabled) return fail(403, 'disabled', 'The Clearing House kiosk is not open yet.');
  const citizen = await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string | null }>();
  const nationId = citizen?.nation_id ?? null;
  if (nationId === 'korund') return fail(403, 'non_convertible', 'The Labor Note is non-convertible; Korund citizens cannot buy Tessera.');
  if (!nationId || !(kioskNations as readonly string[]).includes(nationId)) return fail(403, 'no_kiosk', 'Only Kindle citizens can use the Clearing House kiosk in this preview.');
  const cost = sparkCost(command.tesseraMinor);
  const prior = await db.prepare('SELECT clerk_user_id, spark_minor, tessera_minor FROM citizen_tessera_exchanges WHERE request_id=?').bind(command.requestId)
    .first<{ clerk_user_id: string; spark_minor: number; tessera_minor: number }>();
  if (prior) {
    if (prior.clerk_user_id !== userId || Number(prior.tessera_minor) !== command.tesseraMinor) return fail(409, 'request_reused', 'That request id was already used for a different exchange.');
    return { ok: true, ...(await balances(db, userId)), boughtTesseraMinor: Number(prior.tessera_minor), costSparkMinor: Number(prior.spark_minor), replay: true };
  }
  // One statement: the exchange row (SPK debit + TSR credit) is written only while the Spark balance still covers it.
  await db.prepare(`INSERT INTO citizen_tessera_exchanges(request_id,clerk_user_id,nation_id,spark_minor,tessera_minor,occurred_at)
    SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM citizens WHERE clerk_user_id=? AND nation_id='kindle')
      AND COALESCE((SELECT balance FROM citizen_wallet_balances WHERE clerk_user_id=?),0) >= ?
    ON CONFLICT DO NOTHING`).bind(command.requestId, userId, nationId, cost, command.tesseraMinor, now, userId, userId, cost).run();
  const created = await db.prepare('SELECT clerk_user_id, tessera_minor FROM citizen_tessera_exchanges WHERE request_id=?').bind(command.requestId)
    .first<{ clerk_user_id: string; tessera_minor: number }>();
  if (!created) {
    const { sparkMinor } = await balances(db, userId);
    return fail(409, 'insufficient_spark', `${(command.tesseraMinor / 100).toFixed(2)} TSR costs ${(cost / 100).toFixed(2)} SPK; you hold ${(sparkMinor / 100).toFixed(2)} SPK.`);
  }
  if (created.clerk_user_id !== userId || Number(created.tessera_minor) !== command.tesseraMinor) return fail(409, 'request_reused', 'That request id was already used for a different exchange.');
  return { ok: true, ...(await balances(db, userId)), boughtTesseraMinor: command.tesseraMinor, costSparkMinor: cost };
}
