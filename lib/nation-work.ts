/** #490 (Stage 0d of the seven-nations plan, design on #486 sections 2 and 3): one generic, single-entry wage ledger and work command pair for every
 *  nation that has no ledger of its own. Behind HARIMU_NATION_WORK_ENABLED (default "false"): off, both commands are 404, the plan is absent and nothing is written.
 *
 *  Modeled on korund-start-work / korund-claim-work, with the job (wage, hours, capacity cost) taken from the nation's opening (`lib/nation-openings.ts`) instead of a literal.
 *  Kindle, Korund and Aurelle have no `jobs` there and keep their own tables; for them (and for any nation without jobs) the commands are 404.
 *  Nothing here is stored as a balance: wallet = SUM(settlements) - SUM(spends) for the citizen and nation; fund = initial - SUM(settlements) + SUM(spends).
 *  Each claimed shift pays once (nation_wage_settlements.shift_id is the primary key), so a retry or a parallel claim cannot pay twice.
 *  Reads never write. The scheduled Worker is not involved: nothing here is periodic. No bands, pegs or scrip. */
import type { GameDatabase } from './database-contract';
import { nationOpening, nationPlayable, type NationJob, type NationOpening } from './nation-openings';
import type { QaBindings } from './qa-tools';

export const nationWorkSchemas = [
 `CREATE TABLE IF NOT EXISTS nation_wage_funds (nation_id TEXT PRIMARY KEY REFERENCES nations(id), initial_minor INTEGER NOT NULL CHECK(initial_minor >= 0))`,
 `CREATE TABLE IF NOT EXISTS nation_wage_starts (shift_id TEXT PRIMARY KEY REFERENCES work_shifts(id), nation_id TEXT NOT NULL REFERENCES nations(id), clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id), job_id TEXT NOT NULL, capacity_applied INTEGER NOT NULL DEFAULT 0 CHECK(capacity_applied IN (0,1)))`,
 `CREATE TABLE IF NOT EXISTS nation_wage_settlements (shift_id TEXT PRIMARY KEY REFERENCES work_shifts(id), nation_id TEXT NOT NULL REFERENCES nations(id), clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id), job_id TEXT NOT NULL, wage_minor INTEGER NOT NULL CHECK(wage_minor > 0), settled_at INTEGER NOT NULL)`,
 `CREATE INDEX IF NOT EXISTS idx_nation_wage_settlements_wallet ON nation_wage_settlements(nation_id, clerk_user_id)`,
 `CREATE TABLE IF NOT EXISTS nation_wage_spends (id TEXT PRIMARY KEY, nation_id TEXT NOT NULL REFERENCES nations(id), clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id), amount_minor INTEGER NOT NULL CHECK(amount_minor > 0), reason TEXT NOT NULL, occurred_at INTEGER NOT NULL)`,
 `CREATE INDEX IF NOT EXISTS idx_nation_wage_spends_wallet ON nation_wage_spends(nation_id, clerk_user_id)`,
] as const;

/** The wallet of one citizen in one nation (placeholders, in order: nation, citizen, nation, citizen). One function, so a future spend path and the reads cannot drift. */
export const nationWalletSql = `(COALESCE((SELECT SUM(wage_minor) FROM nation_wage_settlements WHERE nation_id=? AND clerk_user_id=?),0)-COALESCE((SELECT SUM(amount_minor) FROM nation_wage_spends WHERE nation_id=? AND clerk_user_id=?),0))`;
export const nationWalletBinds = (nationId: string, userId: string) => [nationId, userId, nationId, userId];
/** What the nation's wage fund can still pay (placeholders: nation, nation, nation). [ASSUMPTION] A spend returns to the fund, as Aurelle's purchases do; nothing spends yet, so this is not observable in Stage 0d. */
export const nationFundSql = `((SELECT initial_minor FROM nation_wage_funds WHERE nation_id=?)-COALESCE((SELECT SUM(wage_minor) FROM nation_wage_settlements WHERE nation_id=?),0)+COALESCE((SELECT SUM(amount_minor) FROM nation_wage_spends WHERE nation_id=?),0))`;
export const nationFundBinds = (nationId: string) => [nationId, nationId, nationId];

export type NationWorkCommand = { action: 'nation-start-work' | 'nation-claim-work'; requestId?: string; jobId?: string; shiftId?: string };
export type NationWorkOptions = {
  enabled: boolean;
  /** The Worker bindings (opening flags and the QA allowlist) that `nationPlayable` reads. */
  bindings?: QaBindings & Readonly<Record<string, string | undefined>>;
  /** Tests inject openings with jobs; production passes none and reads the registry. */
  openings?: readonly NationOpening[];
};
export type NationWorkShift = { id: string; jobId: string; orderName: string; capacitySpent: number; startedAt: string; completesAt: string; claimedAt: string | null; wageMinor: number | null };
export type NationWorkPlan = { nationId: string; currency: { code: string; name: string }; jobs: readonly NationJob[]; walletMinor: number; fundMinor: number; shifts: NationWorkShift[] };

const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export function validNationWorkCommand(body: Record<string, unknown>): body is Record<string, unknown> & NationWorkCommand {
  if (body.action === 'nation-start-work') return uuid(body.requestId) && typeof body.jobId === 'string' && /^[a-z0-9-]{1,64}$/.test(body.jobId) && Object.keys(body).every(k => ['action', 'requestId', 'jobId'].includes(k));
  if (body.action === 'nation-claim-work') return uuid(body.shiftId) && (body.requestId === undefined || uuid(body.requestId)) && Object.keys(body).every(k => ['action', 'shiftId', 'requestId'].includes(k));
  return false;
}

type Ready = { nationId: string; opening: NationOpening & { jobs: readonly NationJob[]; wage: { fundMinor: number }; currency: { code: string; name: string } } };
/** The citizen's nation, when it has a wage ledger (jobs, fund, currency; job ids prefixed with the nation id) and is playable for this account. Anything else: null (fails closed). */
async function ready(db: GameDatabase, userId: string, options: NationWorkOptions): Promise<Ready | null> {
  const citizen = await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string | null }>();
  const nationId = citizen?.nation_id;
  if (!nationId) return null;
  const opening = options.openings ? options.openings.find(o => o.id === nationId) : nationOpening(nationId);
  if (!opening?.jobs?.length || !opening.wage || !opening.currency) return null;
  if (!opening.jobs.every(j => j.id.startsWith(`${nationId}-`) && j.capacityCost > 0 && j.hours > 0 && Number.isInteger(j.wageMinor) && j.wageMinor > 0 && Number.isInteger(j.capacityCost))) return null;
  if (!Number.isInteger(opening.wage.fundMinor) || opening.wage.fundMinor < 0) return null;
  if (!nationPlayable(nationId, options.bindings, userId)) return null;
  return { nationId, opening: opening as Ready['opening'] };
}

/** The plan: null unless the flag is on and the citizen's nation has a wage ledger and is playable for the account. Only SELECTs. */
export async function readNationWork(db: GameDatabase, userId: string, options: NationWorkOptions): Promise<NationWorkPlan | null> {
  if (!options.enabled) return null;
  const r = await ready(db, userId, options);
  if (!r) return null;
  const { nationId, opening } = r;
  const money = await db.prepare(`SELECT ${nationWalletSql} AS wallet, COALESCE(${nationFundSql},?) AS fund`).bind(...nationWalletBinds(nationId, userId), ...nationFundBinds(nationId), opening.wage.fundMinor)
    .first<{ wallet: number; fund: number }>();
  const rows = await db.prepare(`SELECT s.id,s.work_order_id,s.order_name,s.capacity_spent,s.started_at,s.completes_at,s.claimed_at,t.wage_minor
    FROM nation_wage_starts k JOIN work_shifts s ON s.id=k.shift_id LEFT JOIN nation_wage_settlements t ON t.shift_id=s.id
    WHERE k.clerk_user_id=? AND k.nation_id=? ORDER BY s.started_at DESC, s.id DESC LIMIT 20`).bind(userId, nationId).all<{ id: string; work_order_id: string; order_name: string; capacity_spent: number; started_at: string; completes_at: string; claimed_at: string | null; wage_minor: number | null }>();
  return {
    nationId, currency: opening.currency, jobs: opening.jobs, walletMinor: Number(money?.wallet ?? 0), fundMinor: Number(money?.fund ?? opening.wage.fundMinor),
    shifts: rows.results.map(s => ({ id: s.id, jobId: s.work_order_id, orderName: s.order_name, capacitySpent: s.capacity_spent, startedAt: s.started_at, completesAt: s.completes_at, claimedAt: s.claimed_at, wageMinor: s.wage_minor == null ? null : Number(s.wage_minor) })),
  };
}

const notFound = (reason: string) => ({ status: 404, reason, error: 'Not found.' });
export async function executeNationWork(db: GameDatabase, userId: string, command: NationWorkCommand, now: number, options: NationWorkOptions): Promise<{ status: number; reason?: string; error?: string; replayed?: boolean }> {
  // Flag off: not found, nothing read or written (not even the citizen row).
  if (!options.enabled) return notFound('disabled');
  const r = await ready(db, userId, options);
  if (!r) return notFound('unavailable');
  const { nationId, opening } = r;
  const iso = new Date(now * 1000).toISOString();

  if (command.action === 'nation-start-work') {
    const id = command.requestId!.toLowerCase();
    const job = opening.jobs.find(j => j.id === command.jobId);
    if (!job) return notFound('unknown_job');
    const existing = await db.prepare('SELECT s.clerk_user_id,s.work_order_id,k.nation_id FROM work_shifts s LEFT JOIN nation_wage_starts k ON k.shift_id=s.id WHERE s.id=?').bind(id).first<{ clerk_user_id: string; work_order_id: string; nation_id: string | null }>();
    if (existing) return existing.clerk_user_id === userId && existing.work_order_id === job.id && existing.nation_id === nationId ? { status: 200, replayed: true } : { status: 409, reason: 'request_reused', error: 'Request identifier already used.' };
    await db.batch([
      // The work order is only the foreign-key target of the shift. It is closed so /api/world never lists it (a flag-on nation must not leak).
      db.prepare(`INSERT OR IGNORE INTO work_orders (id,nation_id,name,detail,capacity_cost,status,sort_order) VALUES (?,?,?,?,?,'closed',1000)`).bind(job.id, nationId, job.name, job.output, job.capacityCost),
      db.prepare('INSERT OR IGNORE INTO nation_wage_funds (nation_id,initial_minor) VALUES (?,?)').bind(nationId, opening.wage.fundMinor),
      db.prepare(`INSERT OR IGNORE INTO work_shifts (id,clerk_user_id,work_order_id,order_name,output,capacity_spent,started_at,completes_at)
        SELECT ?,clerk_user_id,?,?,?,?,?,? FROM citizens WHERE clerk_user_id=? AND nation_id=? AND capacity>=?
        AND NOT EXISTS(SELECT 1 FROM work_shifts WHERE clerk_user_id=? AND claimed_at IS NULL)`)
        .bind(id, job.id, job.name, job.output, job.capacityCost, iso, new Date((now + job.hours * 3600) * 1000).toISOString(), userId, nationId, job.capacityCost, userId),
      db.prepare('INSERT OR IGNORE INTO nation_wage_starts (shift_id,nation_id,clerk_user_id,job_id,capacity_applied) SELECT id,?,clerk_user_id,work_order_id,0 FROM work_shifts WHERE id=? AND clerk_user_id=? AND work_order_id=?').bind(nationId, id, userId, job.id),
      db.prepare('UPDATE citizens SET capacity=capacity-?,updated_at=? WHERE clerk_user_id=? AND EXISTS(SELECT 1 FROM nation_wage_starts k WHERE k.shift_id=? AND k.clerk_user_id=citizens.clerk_user_id AND k.capacity_applied=0)').bind(job.capacityCost, iso, userId, id),
      db.prepare('UPDATE nation_wage_starts SET capacity_applied=1 WHERE shift_id=? AND clerk_user_id=? AND capacity_applied=0').bind(id, userId),
    ]);
    const started = await db.prepare('SELECT shift_id FROM nation_wage_starts WHERE shift_id=? AND clerk_user_id=? AND capacity_applied=1').bind(id, userId).first();
    return started ? { status: 200 } : { status: 409, reason: 'cannot_start', error: 'Finish your active shift or check your Work Capacity before starting this job.' };
  }

  const shiftId = command.shiftId!.toLowerCase();
  const shift = await db.prepare(`SELECT s.clerk_user_id,s.completes_at,s.claimed_at,k.job_id,k.capacity_applied,t.shift_id AS settled FROM work_shifts s JOIN nation_wage_starts k ON k.shift_id=s.id
    LEFT JOIN nation_wage_settlements t ON t.shift_id=s.id WHERE s.id=? AND s.clerk_user_id=? AND k.nation_id=?`).bind(shiftId, userId, nationId).first<{ completes_at: string; claimed_at: string | null; job_id: string; capacity_applied: number; settled: string | null }>();
  if (!shift) return notFound('no_shift');
  if (shift.settled) {
    // A crash between writing the settlement and setting claimed_at would otherwise leave this shift open forever (start refuses 409 cannot_start), so the replay finishes it.
    if (shift.claimed_at == null) await db.prepare('UPDATE work_shifts SET claimed_at=? WHERE id=? AND clerk_user_id=? AND claimed_at IS NULL AND EXISTS(SELECT 1 FROM nation_wage_settlements WHERE shift_id=work_shifts.id AND clerk_user_id=?)').bind(iso, shiftId, userId, userId).run();
    return { status: 200, replayed: true };
  }
  const job = opening.jobs.find(j => j.id === shift.job_id);
  if (!job || !shift.capacity_applied) return notFound('no_shift');
  if (shift.completes_at > iso) return { status: 409, reason: 'underway', error: 'Your shift is still underway.' };
  await db.prepare(`INSERT OR IGNORE INTO nation_wage_settlements (shift_id,nation_id,clerk_user_id,job_id,wage_minor,settled_at)
    SELECT s.id,k.nation_id,s.clerk_user_id,k.job_id,?,? FROM work_shifts s JOIN nation_wage_starts k ON k.shift_id=s.id
    WHERE s.id=? AND s.clerk_user_id=? AND k.nation_id=? AND k.capacity_applied=1 AND s.claimed_at IS NULL AND s.completes_at<=? AND ?<=${nationFundSql}`)
    .bind(job.wageMinor, now, shiftId, userId, nationId, iso, job.wageMinor, ...nationFundBinds(nationId)).run();
  // Committed re-check (pattern of the Korund coupons, #43): under Postgres READ COMMITTED two claims can pass the guard against the same pre-insert fund.
  // The later check of any racing pair sees both rows, so an overdrawn fund is always detected and this claim is withdrawn (ties withdraw both; the shift stays unclaimed and can be retried).
  const after = await db.prepare(`SELECT ${nationFundSql} AS fund, (SELECT COUNT(*) FROM nation_wage_settlements WHERE shift_id=?) AS mine`).bind(...nationFundBinds(nationId), shiftId).first<{ fund: number; mine: number }>();
  if (Number(after?.mine ?? 0) > 0 && Number(after?.fund ?? 0) < 0) {
    await db.prepare('DELETE FROM nation_wage_settlements WHERE shift_id=? AND clerk_user_id=?').bind(shiftId, userId).run();
    return { status: 409, reason: 'fund_short', error: 'The nation wage fund cannot pay this shift yet. Your finished shift is kept.' };
  }
  await db.prepare('UPDATE work_shifts SET claimed_at=? WHERE id=? AND clerk_user_id=? AND claimed_at IS NULL AND EXISTS(SELECT 1 FROM nation_wage_settlements WHERE shift_id=work_shifts.id AND clerk_user_id=?)').bind(iso, shiftId, userId, userId).run();
  const settled = await db.prepare('SELECT shift_id FROM nation_wage_settlements WHERE shift_id=? AND clerk_user_id=?').bind(shiftId, userId).first();
  return settled ? { status: 200 } : { status: 409, reason: 'fund_short', error: 'The nation wage fund cannot pay this shift yet. Your finished shift is kept.' };
}
