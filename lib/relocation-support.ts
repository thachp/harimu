import type { GameDatabase } from './database-contract';
import { isUniqueViolation } from './db-errors';
import { outpostCityForNation } from './cities';
import { perCitizenMinor, protocolPotMinor, reliefLapseSeconds, reliefNations, reliefTreasuryTopupCapMinor, reliefWeekSeconds } from './relocation-support-rules';

/** #470 slice 2 (Decision 109): relocation support claims, off by default behind HARIMU_RELOCATION_SUPPORT_ENABLED. After a city capture, each eligible defender citizen whose home city it was claims one flat
 *  Tessera payout. The pot is written once, at the first claim, from the capped protocol budget (plus a defender-treasury top-up that is 0 until Patrick sets a cap). Claims are their own table and count in
 *  the shared balance (tesseraBalanceSql); the ledger reason CHECK is untouched. The capture code is untouched: support is a separate step. No exchange, cash-out, Spark or Kindle exchange link. */
export const relocationSupportSchemas = [
  `CREATE TABLE IF NOT EXISTS relocation_support_pots (
 capture_id TEXT PRIMARY KEY REFERENCES city_captures(id) ON DELETE CASCADE,
 protocol_minor INTEGER NOT NULL CHECK(protocol_minor >= 0),
 treasury_topup_minor INTEGER NOT NULL CHECK(treasury_topup_minor >= 0),
 eligible_count INTEGER NOT NULL CHECK(eligible_count >= 0),
 per_citizen_minor INTEGER NOT NULL CHECK(per_citizen_minor >= 0),
 created_at INTEGER NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS relocation_support_claims (
 capture_id TEXT NOT NULL REFERENCES relocation_support_pots(capture_id) ON DELETE CASCADE,
 clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 request_id TEXT NOT NULL UNIQUE,
 amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
 claimed_at INTEGER NOT NULL,
 PRIMARY KEY (capture_id, clerk_user_id)
)`,
  'CREATE INDEX IF NOT EXISTS idx_relocation_support_claims_user ON relocation_support_claims(clerk_user_id)',
] as const;

export type ReliefBindings = { HARIMU_RELOCATION_SUPPORT_ENABLED?: string };
export const relocationSupportEnabled = (bindings?: ReliefBindings) => bindings?.HARIMU_RELOCATION_SUPPORT_ENABLED === 'true';
export type Verify = (userId: string) => Promise<boolean>;
export type ReliefCommand = { captureId: string; requestId: string };
export type ReliefResult = { ok: true; replay?: true; captureId: string; amountMinor: number; currency: 'TSR' } | { ok: false; status: 403 | 404 | 409; reason: string; error: string };
const fail = (status: 403 | 404 | 409, reason: string, error: string): ReliefResult => ({ ok: false, status, reason, error });
const paid = (captureId: string, amountMinor: number, replay = false): ReliefResult => ({ ok: true, ...(replay ? { replay: true as const } : {}), captureId, amountMinor: Number(amountMinor), currency: 'TSR' });

export function parseReliefCommand(body: Record<string, unknown>): ReliefCommand | null {
  if (body.action !== 'claim' || typeof body.captureId !== 'string' || !/^[A-Za-z0-9:-]{1,80}$/.test(body.captureId) || typeof body.requestId !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(body.requestId)) return null;
  return { captureId: body.captureId, requestId: body.requestId };
}

/** The citizens' home-city id for a captured city key: an outpost is its catalog id, a founded city its world_cities id. [ASSUMPTION] Today no citizen's home city is an outpost or a founded city (homes are the
 *  capital and two catalog cities, which can never be captured), so in practice nobody is eligible yet: this is the home-city gap #470 lists as open. */
export function homeCityForCapture(cityKey: string): string | null {
  if (cityKey.startsWith('city:')) return cityKey.slice('city:'.length) || null;
  if (cityKey.startsWith('outpost:')) return outpostCityForNation(cityKey.slice('outpost:'.length))?.id ?? null;
  return null;
}

type Capture = { id: string; defender_nation: string; captured_at: number; city_key: string; siege_created_at: number };
const eligibleFrom = `FROM citizens c JOIN citizen_city_locations l ON l.user_id=c.clerk_user_id WHERE c.nation_id=? AND l.nation_id=? AND l.home_city_id=? AND c.created_at<?`;

/** Writes the pot once (primary key), the first time anyone claims. The weekly cap is re-checked inside the insert, so two first claims on different captures cannot overrun it. */
async function ensurePot(db: GameDatabase, capture: Capture, home: string, now: number) {
  const before = new Date(Number(capture.siege_created_at) * 1000).toISOString(), since = now - reliefWeekSeconds;
  const eligible = Number((await db.prepare(`SELECT COUNT(*) AS n ${eligibleFrom}`).bind(capture.defender_nation, capture.defender_nation, home, before).first<{ n: number }>())?.n ?? 0);
  for (let attempt = 0; attempt < 3; attempt++) {
    const existing = await db.prepare('SELECT per_citizen_minor, protocol_minor, treasury_topup_minor FROM relocation_support_pots WHERE capture_id=?').bind(capture.id).first<{ per_citizen_minor: number }>();
    if (existing) return existing;
    const used = Number((await db.prepare('SELECT COALESCE(SUM(protocol_minor),0) AS n FROM relocation_support_pots WHERE created_at>?').bind(since).first<{ n: number }>())?.n ?? 0);
    const protocol = protocolPotMinor(used), topup = reliefTreasuryTopupCapMinor, per = perCitizenMinor(protocol + topup, eligible);
    await db.prepare(`INSERT INTO relocation_support_pots(capture_id,protocol_minor,treasury_topup_minor,eligible_count,per_citizen_minor,created_at)
      SELECT ?,?,?,?,?,? WHERE COALESCE((SELECT SUM(protocol_minor) FROM relocation_support_pots WHERE created_at>?),0) + ? <= ? ON CONFLICT DO NOTHING`)
      .bind(capture.id, protocol, topup, eligible, per, now, since, protocol, used + protocol).run();
  }
  return db.prepare('SELECT per_citizen_minor FROM relocation_support_pots WHERE capture_id=?').bind(capture.id).first<{ per_citizen_minor: number }>();
}

export async function claimRelocationSupport(db: GameDatabase, userId: string, command: ReliefCommand, now: number, verify: Verify): Promise<ReliefResult> {
  const prior = await db.prepare('SELECT capture_id,clerk_user_id,amount_minor FROM relocation_support_claims WHERE request_id=?').bind(command.requestId).first<{ capture_id: string; clerk_user_id: string; amount_minor: number }>();
  if (prior) return prior.clerk_user_id === userId && prior.capture_id === command.captureId ? paid(prior.capture_id, prior.amount_minor, true) : fail(409, 'request_reused', 'This request identifier was already used for a different claim or account.');
  const capture = await db.prepare(`SELECT p.id AS id, p.defender_nation AS defender_nation, p.captured_at AS captured_at, s.city_key AS city_key, s.created_at AS siege_created_at
    FROM city_captures p JOIN city_sieges s ON s.id=p.siege_id WHERE p.id=?`).bind(command.captureId).first<Capture>();
  if (!capture) return fail(404, 'no_capture', 'No such city capture.');
  if (!reliefNations.includes(capture.defender_nation)) return fail(409, 'nation_not_supported', 'Relocation support is not available for this nation yet.');
  if (now > Number(capture.captured_at) + reliefLapseSeconds) return fail(409, 'lapsed', 'Relocation support for this city has closed.');
  const home = homeCityForCapture(capture.city_key), before = new Date(Number(capture.siege_created_at) * 1000).toISOString();
  const mine = home ? await db.prepare(`SELECT 1 AS present ${eligibleFrom} AND c.clerk_user_id=?`).bind(capture.defender_nation, capture.defender_nation, home, before, userId).first() : null;
  if (!home || !mine) return fail(403, 'not_eligible', 'Relocation support is for citizens whose home was this city before the siege.');
  if (!await verify(userId)) return fail(403, 'not_verified', 'Relocation support is claimed only by a verified human citizen.');
  const pot = await ensurePot(db, capture, home, now);
  if (!pot || !(Number(pot.per_citizen_minor) > 0)) return fail(409, 'pot_empty', 'No funds are available for relocation support.');
  try {
    // The pot total is re-checked in the insert, so claims never pay out more than the pot even if more citizens claim than were counted.
    await db.prepare(`INSERT INTO relocation_support_claims(capture_id,clerk_user_id,request_id,amount_minor,claimed_at) SELECT p.capture_id,?,?,p.per_citizen_minor,? FROM relocation_support_pots p
      WHERE p.capture_id=? AND p.per_citizen_minor>0 AND COALESCE((SELECT SUM(amount_minor) FROM relocation_support_claims WHERE capture_id=p.capture_id),0) + p.per_citizen_minor <= p.protocol_minor + p.treasury_topup_minor`)
      .bind(userId, command.requestId, now, capture.id).run();
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const raced = await db.prepare('SELECT capture_id,clerk_user_id,amount_minor FROM relocation_support_claims WHERE request_id=?').bind(command.requestId).first<{ capture_id: string; clerk_user_id: string; amount_minor: number }>();
    if (raced?.clerk_user_id === userId && raced.capture_id === capture.id) return paid(capture.id, raced.amount_minor, true);
    return fail(409, 'already_claimed', 'Relocation support for this city was already claimed.');
  }
  const row = await db.prepare('SELECT amount_minor, request_id FROM relocation_support_claims WHERE capture_id=? AND clerk_user_id=?').bind(capture.id, userId).first<{ amount_minor: number; request_id: string }>();
  if (!row || row.request_id !== command.requestId) return fail(409, row ? 'already_claimed' : 'pot_empty', row ? 'Relocation support for this city was already claimed.' : 'No funds are available for relocation support.');
  return paid(capture.id, row.amount_minor);
}
