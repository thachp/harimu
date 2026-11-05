/** #1089: Hoarvale Moot bills. Assent status and the assent date are columns on the bill, not a second record.
 *  HARIMU_HOARVALE_ASSENT_ENABLED lives in HARIMU_UI_PACK. Callers pass the Worker env. This module never reads process. */
import { flagOn } from './flag-pack.mjs';
import type { GameDatabase } from './database-contract';
import { HOARVALE_BILLS, hoarvaleBills, type AssentStatus, type HoarvaleBill } from './government';

export const HOARVALE_ASSENT_FLAG = 'HARIMU_HOARVALE_ASSENT_ENABLED';
export const hoarvaleAssentEnabled = (env: unknown) => flagOn(env, HOARVALE_ASSENT_FLAG);

export const hoarvaleBillSchemas = [
  `CREATE TABLE IF NOT EXISTS hoarvale_bills (
  bill_id TEXT PRIMARY KEY CHECK(length(bill_id) BETWEEN 1 AND 64),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 80),
  passed_at INTEGER NOT NULL CHECK(passed_at >= 0),
  dissolved_at INTEGER CHECK(dissolved_at IS NULL OR dissolved_at >= passed_at),
  assent_status TEXT NOT NULL CHECK(assent_status IN ('pending','assented','withheld')),
  assent_at INTEGER CHECK(assent_at IS NULL OR assent_at >= 0)
)`,
] as const;

const insertSql = `INSERT OR IGNORE INTO hoarvale_bills (bill_id, title, passed_at, dissolved_at, assent_status, assent_at) VALUES (?,?,?,?,?,?)`;
const updateSql = `UPDATE hoarvale_bills SET assent_status=?, assent_at=? WHERE bill_id=?`;

/** Statements for an existing batch (the world tick). No extra round trip. */
export function hoarvaleBillWrites(db: GameDatabase, now: number) {
  const bills = hoarvaleBills(now);
  return [
    ...HOARVALE_BILLS.map(bill => db.prepare(insertSql).bind(bill.id, bill.title, bill.passedAt, bill.dissolvedAt, 'pending', null)),
    ...bills.map(bill => db.prepare(updateSql).bind(bill.assentStatus, bill.assentAt, bill.id)),
  ];
}

export async function syncHoarvaleBills(db: GameDatabase, now: number): Promise<HoarvaleBill[]> {
  await db.batch(hoarvaleBillWrites(db, now));
  return readHoarvaleBills(db);
}

export async function readHoarvaleBills(db: GameDatabase): Promise<HoarvaleBill[]> {
  const rows = (await db.prepare('SELECT bill_id, title, passed_at, assent_status, assent_at FROM hoarvale_bills ORDER BY bill_id').all<{ bill_id: string; title: string; passed_at: number; assent_status: string; assent_at: number | null }>()).results ?? [];
  return rows.map(row => ({ id: String(row.bill_id), title: String(row.title), passedAt: Number(row.passed_at), assentStatus: String(row.assent_status) as AssentStatus, assentAt: row.assent_at == null ? null : Number(row.assent_at) }));
}

/** Flag off, or any other nation: no read and no write. Empty table: the same rule, still without writing. */
export async function withHoarvaleBills<T extends { nationId: string }>(db: GameDatabase, snapshot: T | null, env: unknown, now: number, nationId?: string | null): Promise<T | (T & { bills: HoarvaleBill[] }) | null> {
  if (nationId !== 'hoarvale' || !hoarvaleAssentEnabled(env) || !snapshot) return snapshot;
  const stored = await readHoarvaleBills(db);
  return { ...snapshot, bills: stored.length ? stored : hoarvaleBills(now) };
}
