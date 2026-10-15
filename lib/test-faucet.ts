import type { GameDatabase } from './database-contract';
import { tesseraBalanceSql } from './tessera-exchange';

/**
 * #631: a preview-only Tessera TEST faucet, so testers can try Tessera features (squares) while the Spark-to-Tessera exchange stays disabled (Decision 111, #626).
 * Open only when HARIMU_TEST_FAUCET_ENABLED is exactly "true" AND this is the isolated preview world (NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW exactly "true"); anything
 * else, production included, is refused. No schema change: a grant is one citizen_tessera_ledger row with reason 'starter-grant' (the existing one-per-citizen partial unique
 * index is the cap) and the id `tsr-test-faucet-<user>`, so a test grant is told apart from a real ledger row by its id prefix. No cash-out, no link to the exchange.
 */
export const testFaucetGrantMinor = 5000; // 50.00 TSR, once per citizen
export const testFaucetIdPrefix = 'tsr-test-faucet-';
export const testFaucetLabel = 'Test faucet, preview only';
export type TestFaucetBindings = { HARIMU_TEST_FAUCET_ENABLED?: string; NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW?: string };
export const testFaucetOpen = (bindings?: TestFaucetBindings) => bindings?.HARIMU_TEST_FAUCET_ENABLED === 'true' && bindings.NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW === 'true';

export type TestFaucetState = { test: true; label: string; available: boolean; grantMinor: number; currency: 'TSR'; granted: boolean; tesseraMinor: number };
export type TestFaucetResult = (TestFaucetState & { ok: true; grantedMinor: number }) | { ok: false; test: true; label: string; status: 403 | 404 | 409; reason: string; error: string };
const refuse = (status: 403 | 404 | 409, reason: string, error: string): TestFaucetResult => ({ ok: false, test: true, label: testFaucetLabel, status, reason, error });

async function readState(db: GameDatabase, userId: string, available: boolean): Promise<TestFaucetState> {
  const row = await db.prepare(`SELECT ${tesseraBalanceSql} AS tessera, (SELECT COUNT(*) FROM citizen_tessera_ledger WHERE clerk_user_id=? AND reason='starter-grant') AS grants`).bind(userId, userId, userId).first<{ tessera: number; grants: number }>();
  return { test: true, label: testFaucetLabel, available, grantMinor: testFaucetGrantMinor, currency: 'TSR', granted: Number(row?.grants ?? 0) > 0, tesseraMinor: Number(row?.tessera ?? 0) };
}
export const readTestFaucet = (db: GameDatabase, userId: string, bindings?: TestFaucetBindings) => readState(db, userId, testFaucetOpen(bindings));

export async function claimTestFaucet(db: GameDatabase, userId: string, now: number, bindings?: TestFaucetBindings): Promise<TestFaucetResult> {
  if (!testFaucetOpen(bindings)) return refuse(404, 'disabled', 'Not found.'); // nothing is read or written; in production it does not exist
  const citizen = await db.prepare('SELECT 1 AS present FROM citizens WHERE clerk_user_id=?').bind(userId).first();
  if (!citizen) return refuse(403, 'no_citizen', 'Create your citizen first.');
  // The cap: one 'starter-grant' row per citizen (the partial unique index), whether an old real one or an earlier test grant. Checked first so a repeat claim is refused, then
  // the insert is conflict-safe so two parallel first claims still write one row.
  const had = await db.prepare("SELECT id FROM citizen_tessera_ledger WHERE clerk_user_id=? AND reason='starter-grant'").bind(userId).first();
  if (!had) await db.prepare(`INSERT INTO citizen_tessera_ledger(id,clerk_user_id,delta_minor,reason,occurred_at) VALUES (?,?,?,'starter-grant',?) ON CONFLICT DO NOTHING`)
    .bind(`${testFaucetIdPrefix}${userId}`, userId, testFaucetGrantMinor, now).run();
  const mine = await db.prepare('SELECT id FROM citizen_tessera_ledger WHERE id=?').bind(`${testFaucetIdPrefix}${userId}`).first();
  const state = await readState(db, userId, true);
  if (had || !mine) return refuse(409, 'cap_reached', 'This citizen already holds a starter grant; the test faucet pays once per citizen.');
  return { ok: true, ...state, grantedMinor: testFaucetGrantMinor };
}
