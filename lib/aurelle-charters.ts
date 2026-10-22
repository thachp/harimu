import type { GameDatabase } from './database-contract';
import { royalFavorBalance, royalFavorBinds, royalFavorSql } from './aurelle';
import { charterGrantFavorCost, charterMealCooldownSeconds, charterKind, charterRenewFavorCost, charterRenewWindowSeconds, charterTermSeconds } from './aurelle-charter-rules';

/** #531: Aurelle guild charters. One row per citizen (the primary key is the race guard for a double grant); a charter is active while it is not revoked and `expires_at` is in the
 *  future, and it lapses by the clock alone (nothing is ever written to make it lapse). The Favor price is one `aurelle_favor_spends` row per grant or renew (reasons
 *  `charter-grant` / `charter-renew`), whose primary key is the request id, so a retry can never charge twice and the guard uses the shared Favor rule (royalFavorSql,
 *  decayed when HARIMU_FAVOR_DECAY_ENABLED is on), so a spend cannot overdraw. Reads never write. */
export const aurelleCharterSchemas = [
  `CREATE TABLE IF NOT EXISTS aurelle_charters (
 clerk_user_id TEXT PRIMARY KEY REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('market-stall')),
 request_id TEXT NOT NULL UNIQUE,
 granted_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 revoked_at INTEGER,
 CHECK(expires_at > granted_at)
)`,
] as const;

export type CharterCommand = { action: 'request-charter' | 'renew-charter'; requestId: string };
export type CharterView = { kind: string; grantedAt: string; expiresAt: string; active: boolean; revoked: boolean };
export type CharterResult = { ok: true; replay?: true; charter: CharterView; favor: number } | { ok: false; status: 400 | 403 | 409; reason: string; error: string };
const fail = (status: 400 | 403 | 409, reason: string, error: string): CharterResult => ({ ok: false, status, reason, error });
const iso = (seconds: number) => new Date(seconds * 1000).toISOString();

export function parseCharterCommand(body: Record<string, unknown>): CharterCommand | null {
  if (body.action !== 'request-charter' && body.action !== 'renew-charter') return null;
  if (typeof body.requestId !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(body.requestId)) return null;
  return { action: body.action, requestId: body.requestId };
}

type Row = { kind: string; granted_at: number; expires_at: number; revoked_at: number | null };
export async function readCharter(db: GameDatabase, userId: string, now: number): Promise<CharterView | null> {
  const row = await db.prepare('SELECT kind,granted_at,expires_at,revoked_at FROM aurelle_charters WHERE clerk_user_id=?').bind(userId).first<Row>();
  return row ? { kind: row.kind, grantedAt: iso(Number(row.granted_at)), expiresAt: iso(Number(row.expires_at)), revoked: row.revoked_at != null, active: row.revoked_at == null && Number(row.expires_at) > now } : null;
}
/** True while the citizen holds an active charter (what a trade right would check). */
export async function holdsCharter(db: GameDatabase, userId: string, now: number) { return (await readCharter(db, userId, now))?.active === true; }

export async function actCharter(db: GameDatabase, userId: string, command: CharterCommand, now: number, favorDecayAt?: number): Promise<CharterResult> {
  const reason = command.action === 'request-charter' ? 'charter-grant' : 'charter-renew', cost = reason === 'charter-grant' ? charterGrantFavorCost : charterRenewFavorCost;
  const prior = await db.prepare('SELECT clerk_user_id,reason,amount FROM aurelle_favor_spends WHERE request_id=?').bind(command.requestId).first<{ clerk_user_id: string; reason: string; amount: number }>();
  if (prior) {
    if (prior.clerk_user_id !== userId || prior.reason !== reason) return fail(409, 'request_reused', 'This request identifier was already used for a different action or account.');
    return { ok: true, replay: true, charter: (await readCharter(db, userId, now))!, favor: await royalFavorBalance(db, userId, favorDecayAt) };
  }
  const citizen = await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string | null }>();
  if (citizen?.nation_id !== 'aurelle') return fail(403, 'not_aurelle', 'Only Aurelle citizens can hold a guild charter.');
  const held = await readCharter(db, userId, now);
  if (command.action === 'request-charter' && held?.active) return fail(409, 'already_active', 'You already hold an active charter.');
  if (command.action === 'renew-charter' && !held?.active) return fail(409, 'not_active', 'Only an active charter can be renewed; request a new one.');
  if (command.action === 'renew-charter' && Date.parse(held!.expiresAt) / 1000 - now > charterRenewWindowSeconds) return fail(409, 'too_early', 'A charter can be renewed only in its last days.');
  if (await royalFavorBalance(db, userId, favorDecayAt) < cost) return fail(409, 'insufficient_royal_favor', 'Not enough Royal Favor for this charter.');
  // One transaction: the guarded spend (Favor, citizenship and the charter state are all checked in the statement), then the charter row only if this request's spend exists.
  const spend = db.prepare(`INSERT INTO aurelle_favor_spends(request_id,clerk_user_id,amount,reason,spent_at)
    SELECT ?,?,?,?,? WHERE (${royalFavorSql(favorDecayAt)}) >= ? AND EXISTS(SELECT 1 FROM citizens WHERE clerk_user_id=? AND nation_id='aurelle')
    AND ${command.action === 'request-charter'
      ? 'NOT EXISTS(SELECT 1 FROM aurelle_charters WHERE clerk_user_id=? AND revoked_at IS NULL AND expires_at>?)'
      : 'EXISTS(SELECT 1 FROM aurelle_charters WHERE clerk_user_id=? AND revoked_at IS NULL AND expires_at>? AND expires_at<=?)'}
    ON CONFLICT DO NOTHING`).bind(command.requestId, userId, cost, reason, now, ...royalFavorBinds(userId, favorDecayAt), cost, userId, userId, now, ...(command.action === 'renew-charter' ? [now + charterRenewWindowSeconds] : []));
  const charter = command.action === 'request-charter'
    ? db.prepare(`INSERT INTO aurelle_charters(clerk_user_id,kind,request_id,granted_at,expires_at,revoked_at)
        SELECT ?,?,?,?,?,NULL WHERE EXISTS(SELECT 1 FROM aurelle_favor_spends WHERE request_id=? AND clerk_user_id=? AND reason='charter-grant')
        ON CONFLICT(clerk_user_id) DO UPDATE SET kind=excluded.kind,request_id=excluded.request_id,granted_at=excluded.granted_at,expires_at=excluded.expires_at,revoked_at=NULL
        WHERE aurelle_charters.request_id<>excluded.request_id AND (aurelle_charters.revoked_at IS NOT NULL OR aurelle_charters.expires_at<=excluded.granted_at)`)
        .bind(userId, charterKind, command.requestId, now, now + charterTermSeconds, command.requestId, userId)
    : db.prepare(`UPDATE aurelle_charters SET expires_at=expires_at+?,request_id=? WHERE clerk_user_id=? AND request_id<>? AND revoked_at IS NULL AND expires_at>?
        AND EXISTS(SELECT 1 FROM aurelle_favor_spends WHERE request_id=? AND clerk_user_id=? AND reason='charter-renew')`)
        .bind(charterTermSeconds, command.requestId, userId, command.requestId, now, command.requestId, userId);
  await db.batch([spend, charter]);
  const done = await db.prepare('SELECT clerk_user_id,reason FROM aurelle_favor_spends WHERE request_id=?').bind(command.requestId).first<{ clerk_user_id: string; reason: string }>();
  if (!done) return fail(409, 'unavailable', 'The charter could not be granted; nothing was charged. Your Favor or charter changed.');
  if (done.clerk_user_id !== userId || done.reason !== reason) return fail(409, 'request_reused', 'This request identifier was already used for a different action or account.');
  return { ok: true, charter: (await readCharter(db, userId, now))!, favor: await royalFavorBalance(db, userId, favorDecayAt) };
}

/** Operator/QA path only (the route checks the QA allowlist): revoke a citizen's active charter. No refund (an [ASSUMPTION], see aurelle-charter-rules.ts); idempotent by state. */
export async function revokeCharter(db: GameDatabase, targetUserId: string, now: number): Promise<{ ok: true; revoked: boolean; charter: CharterView | null }> {
  await db.prepare('UPDATE aurelle_charters SET revoked_at=? WHERE clerk_user_id=? AND revoked_at IS NULL').bind(now, targetUserId).run();
  const charter = await readCharter(db, targetUserId, now);
  return { ok: true, revoked: charter?.revoked === true, charter };
}

/** The one trade right: the household-meal cooldown in force. Undefined (the unchanged default) unless the flag is on and the citizen holds an active charter. */
export async function charterMealSeconds(db: GameDatabase, userId: string, now: number, enabled: boolean) { return enabled && await holdsCharter(db, userId, now) ? charterMealCooldownSeconds : undefined; }
