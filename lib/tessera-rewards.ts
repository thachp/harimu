import type { GameDatabase } from './database-contract';
import { allocateRewards, rewardCitizenEpochCapMinor, rewardCitizenLifetimeCapMinor, rewardEpochSeconds, rewardLookbackEpochs, rewardMaxShiftsPerEpoch, rewardPerShiftMinor, rewardPoolMinor, rewardProvenance } from './tessera-rewards-rules';

/** #465 slice 1 (ARC: Option A, shift source only). Earned Tessera, off by default behind HARIMU_TESSERA_REWARDS_ENABLED. A fixed pool per UTC day is split pro-rata at epoch close by the scheduled Worker, which writes one
 *  immutable entry per verified settled Kindle shift (source shift id UNIQUE, so a shift pays once). A citizen then claims one entry per request at the kiosk (entry id and request id both UNIQUE, so a retry or a
 *  double click never pays twice). Reads never write. NOT in this slice: adding claimed rewards to the TSR balance (slice 2), and no exchange, cash-out, Kindle link, conversion or Spark origin tracking. */
export const tesseraRewardSchemas = [
  `CREATE TABLE IF NOT EXISTS tessera_reward_epochs (
 epoch_day INTEGER PRIMARY KEY,
 pool_minor INTEGER NOT NULL CHECK(pool_minor >= 0),
 allocated_minor INTEGER NOT NULL CHECK(allocated_minor >= 0 AND allocated_minor <= pool_minor),
 entries INTEGER NOT NULL CHECK(entries >= 0),
 closed_at INTEGER NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS tessera_reward_entries (
 id TEXT PRIMARY KEY,
 epoch_day INTEGER NOT NULL REFERENCES tessera_reward_epochs(epoch_day),
 clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 source_shift_id TEXT NOT NULL UNIQUE REFERENCES shift_settlements(shift_id),
 amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
 provenance TEXT NOT NULL CHECK(provenance IN ('shift'))
)`,
  `CREATE TABLE IF NOT EXISTS tessera_reward_claims (
 entry_id TEXT PRIMARY KEY REFERENCES tessera_reward_entries(id),
 request_id TEXT NOT NULL UNIQUE,
 clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
 claimed_at INTEGER NOT NULL
)`,
  'CREATE INDEX IF NOT EXISTS idx_tessera_reward_entries_user ON tessera_reward_entries(clerk_user_id, epoch_day)',
] as const;

export type RewardBindings = { HARIMU_TESSERA_REWARDS_ENABLED?: string };
export const tesseraRewardsEnabled = (bindings?: RewardBindings) => bindings?.HARIMU_TESSERA_REWARDS_ENABLED === 'true';
export type Verify = (userId: string) => Promise<boolean>;
export type CloseResult = { status: 'closed' | 'already-closed' | 'not-ended'; entries: number; allocatedMinor: number };

/** Idempotent: the epoch row is the primary-key guard, written in the same transaction as its entries, so overlapping cron runs close an epoch once. */
export async function closeRewardEpoch(db: GameDatabase, epochDay: number, now: number, verify: Verify): Promise<CloseResult> {
  if ((epochDay + 1) * rewardEpochSeconds > now) return { status: 'not-ended', entries: 0, allocatedMinor: 0 };
  if (await db.prepare('SELECT 1 AS present FROM tessera_reward_epochs WHERE epoch_day=?').bind(epochDay).first()) return { status: 'already-closed', entries: 0, allocatedMinor: 0 };
  const from = new Date(epochDay * rewardEpochSeconds * 1000).toISOString(), to = new Date((epochDay + 1) * rewardEpochSeconds * 1000).toISOString();
  const rows = (await db.prepare(`SELECT s.shift_id AS shift_id, s.clerk_user_id AS user_id FROM shift_settlements s JOIN citizens c ON c.clerk_user_id=s.clerk_user_id
    WHERE s.settled_at>=? AND s.settled_at<? AND NOT EXISTS (SELECT 1 FROM tessera_reward_entries e WHERE e.source_shift_id=s.shift_id) ORDER BY s.settled_at, s.shift_id LIMIT ?`)
    .bind(from, to, rewardMaxShiftsPerEpoch).all<{ shift_id: string; user_id: string }>()).results;
  const verified = new Map<string, boolean>(), lifetime: Record<string, number> = {};
  for (const row of rows) if (!verified.has(row.user_id)) {
    verified.set(row.user_id, await verify(row.user_id));
    lifetime[row.user_id] = Number((await db.prepare('SELECT COALESCE(SUM(amount_minor),0) AS n FROM tessera_reward_entries WHERE clerk_user_id=?').bind(row.user_id).first<{ n: number }>())?.n ?? 0);
  }
  const entries = allocateRewards(rows.filter(row => verified.get(row.user_id)).map(row => ({ shiftId: row.shift_id, userId: row.user_id })), lifetime), allocated = entries.reduce((sum, e) => sum + e.amountMinor, 0);
  try {
    await db.batch([db.prepare('INSERT INTO tessera_reward_epochs(epoch_day,pool_minor,allocated_minor,entries,closed_at) VALUES (?,?,?,?,?)').bind(epochDay, rewardPoolMinor, allocated, entries.length, now),
      ...entries.map(e => db.prepare('INSERT INTO tessera_reward_entries(id,epoch_day,clerk_user_id,source_shift_id,amount_minor,provenance) VALUES (?,?,?,?,?,?)').bind(`trw-${epochDay}-${e.shiftId}`, epochDay, e.userId, e.shiftId, e.amountMinor, rewardProvenance))]);
  } catch (error) {
    if (await db.prepare('SELECT 1 AS present FROM tessera_reward_epochs WHERE epoch_day=?').bind(epochDay).first()) return { status: 'already-closed', entries: 0, allocatedMinor: 0 }; // a parallel run won the race
    throw error;
  }
  return { status: 'closed', entries: entries.length, allocatedMinor: allocated };
}

/** The scheduled Worker's entry point: a no-op unless the flag is exactly "true". Closes only whole past days, oldest first, never today. */
export async function runTesseraRewardCron(db: GameDatabase, now: number, bindings: RewardBindings, verify: Verify) {
  if (!tesseraRewardsEnabled(bindings)) return { status: 'disabled' as const, closed: [] as CloseResult[] };
  const today = Math.floor(now / rewardEpochSeconds), closed: CloseResult[] = [];
  for (let day = today - rewardLookbackEpochs; day < today; day++) closed.push(await closeRewardEpoch(db, day, now, verify));
  return { status: 'ran' as const, closed };
}

export type KioskEntry = { entryId: string; epochDay: number; amountMinor: number; claimedAt?: string };
export type KioskView = { currency: 'TSR'; provenance: 'earned'; claimable: KioskEntry[]; history: KioskEntry[]; claimableMinor: number; claimedMinor: number; rules: { perShiftMinor: number; perEpochCapMinor: number; lifetimeCapMinor: number; poolMinor: number } };
export async function readRewardKiosk(db: GameDatabase, userId: string): Promise<KioskView> {
  const rows = (await db.prepare(`SELECT e.id AS id, e.epoch_day AS epoch_day, e.amount_minor AS amount_minor, c.claimed_at AS claimed_at FROM tessera_reward_entries e
    LEFT JOIN tessera_reward_claims c ON c.entry_id=e.id WHERE e.clerk_user_id=? ORDER BY e.epoch_day DESC, e.id LIMIT 100`).bind(userId).all<{ id: string; epoch_day: number; amount_minor: number; claimed_at: number | null }>()).results;
  const view = (r: (typeof rows)[number]): KioskEntry => ({ entryId: r.id, epochDay: Number(r.epoch_day), amountMinor: Number(r.amount_minor), ...(r.claimed_at != null ? { claimedAt: new Date(Number(r.claimed_at) * 1000).toISOString() } : {}) });
  const claimable = rows.filter(r => r.claimed_at == null).map(view), history = rows.filter(r => r.claimed_at != null).map(view), sum = (list: KioskEntry[]) => list.reduce((n, e) => n + e.amountMinor, 0);
  return { currency: 'TSR', provenance: 'earned', claimable, history, claimableMinor: sum(claimable), claimedMinor: sum(history), rules: { perShiftMinor: rewardPerShiftMinor, perEpochCapMinor: rewardCitizenEpochCapMinor, lifetimeCapMinor: rewardCitizenLifetimeCapMinor, poolMinor: rewardPoolMinor } };
}

export type ClaimCommand = { entryId: string; requestId: string };
export type ClaimResult = { ok: true; replay?: true; entryId: string; amountMinor: number } | { ok: false; status: 403 | 404 | 409; reason: string; error: string };
const fail = (status: 403 | 404 | 409, reason: string, error: string): ClaimResult => ({ ok: false, status, reason, error });
export function parseClaimCommand(body: Record<string, unknown>): ClaimCommand | null {
  if (body.action !== 'claim' || typeof body.entryId !== 'string' || !/^trw-\d{1,6}-[A-Za-z0-9-]{1,80}$/.test(body.entryId) || typeof body.requestId !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(body.requestId)) return null;
  return { entryId: body.entryId, requestId: body.requestId };
}
export async function claimReward(db: GameDatabase, userId: string, command: ClaimCommand, now: number, verify: Verify): Promise<ClaimResult> {
  const prior = await db.prepare('SELECT entry_id,clerk_user_id,amount_minor FROM tessera_reward_claims WHERE request_id=?').bind(command.requestId).first<{ entry_id: string; clerk_user_id: string; amount_minor: number }>();
  if (prior) return prior.clerk_user_id === userId && prior.entry_id === command.entryId ? { ok: true, replay: true, entryId: prior.entry_id, amountMinor: Number(prior.amount_minor) } : fail(409, 'request_reused', 'This request identifier was already used for a different claim or account.');
  const entry = await db.prepare('SELECT amount_minor FROM tessera_reward_entries WHERE id=? AND clerk_user_id=?').bind(command.entryId, userId).first<{ amount_minor: number }>();
  if (!entry) return fail(404, 'no_entry', 'No such reward.'); // another citizen's entry looks the same as a missing one
  if (!await verify(userId)) return fail(403, 'not_verified', 'Rewards are claimed only by a verified human citizen.');
  try {
    await db.prepare('INSERT INTO tessera_reward_claims(entry_id,request_id,clerk_user_id,amount_minor,claimed_at) SELECT id,?,clerk_user_id,amount_minor,? FROM tessera_reward_entries WHERE id=? AND clerk_user_id=?').bind(command.requestId, now, command.entryId, userId).run();
  } catch {
    const raced = await db.prepare('SELECT entry_id,clerk_user_id FROM tessera_reward_claims WHERE request_id=?').bind(command.requestId).first<{ entry_id: string; clerk_user_id: string }>();
    if (raced?.clerk_user_id === userId && raced.entry_id === command.entryId) return { ok: true, replay: true, entryId: command.entryId, amountMinor: Number(entry.amount_minor) };
    return fail(409, 'already_claimed', 'This reward was already claimed.');
  }
  return { ok: true, entryId: command.entryId, amountMinor: Number(entry.amount_minor) };
}
