/** #863: Kindle campaign donations PoC behind HARIMU_PARTY_DONATIONS_ENABLED. A citizen moves Spark from their wallet to one AI party's account.
 *  Ledger: each party_donations row is both legs of one transfer: the citizen debit (citizen_wallet_balances subtracts it) and the party-account credit
 *  (partyAccountBalanceSql sums it). No Spark is created or destroyed. Every donation is public (donor display name, amount, time).
 *  Donations add NO votes, ballot weight or primary weight: nothing in lib/elections.ts or lib/primaries.ts reads party_donations (pinned by tests/party-donations-863.test.mjs). */
import type { GameDatabase } from './database-contract';
import { kindleParties, kindleParty } from './kindle-parties';
import { donationDisclosureLimit, donationWeek, donationWeeklyCapMinor } from './party-donations-rules';
export * from './party-donations-rules';
export { partyDonationsSchema, partyDonationsIndex } from './market-orders';

export const partyAccountBalanceSql = 'SELECT party_id, COALESCE(SUM(amount_minor),0) AS balance FROM party_donations GROUP BY party_id';
export type DonationView = { parties: { id: string; name: string; raisedMinor: number; recent: { donor: string; amountMinor: number; donatedAt: number }[] }[]; capMinor: number; givenThisWeek: Record<string, number> };
type Refusal = { ok: false; status: number; error: string; reason: string };

export async function readDonations(db: GameDatabase, userId: string | null, now: number): Promise<DonationView> {
  const totals = (await db.prepare(partyAccountBalanceSql).all<{ party_id: string; balance: number }>()).results ?? [];
  const parties = [];
  for (const p of kindleParties) {
    const recent = ((await db.prepare(`SELECT COALESCE(c.display_name,'A citizen') AS donor, d.amount_minor, d.donated_at FROM party_donations d JOIN citizens c ON c.clerk_user_id=d.clerk_user_id
      WHERE d.party_id=? ORDER BY d.donated_at DESC, d.request_id DESC LIMIT ${donationDisclosureLimit}`).bind(p.id).all<{ donor: string; amount_minor: number; donated_at: number }>()).results ?? [])
      .map(r => ({ donor: r.donor, amountMinor: Number(r.amount_minor), donatedAt: Number(r.donated_at) }));
    parties.push({ id: p.id, name: p.name, raisedMinor: Number(totals.find(t => t.party_id === p.id)?.balance ?? 0), recent });
  }
  const givenThisWeek: Record<string, number> = {};
  if (userId) for (const r of ((await db.prepare('SELECT party_id, SUM(amount_minor) AS n FROM party_donations WHERE clerk_user_id=? AND week=? GROUP BY party_id').bind(userId, donationWeek(now)).all<{ party_id: string; n: number }>()).results ?? [])) givenThisWeek[r.party_id] = Number(r.n);
  return { parties, capMinor: donationWeeklyCapMinor, givenThisWeek };
}

/** One atomic INSERT: the row is written only if the party is known, the wallet covers the amount and the weekly cap holds. Replaying a requestId is a no-op. */
export async function donate(db: GameDatabase, userId: string, cmd: { partyId: string; amountMinor: number; requestId: string }, now: number): Promise<{ ok: true } | Refusal> {
  if (!kindleParty(cmd.partyId)) return { ok: false, status: 400, error: 'Unknown party.', reason: 'bad_request' };
  const week = donationWeek(now);
  const prior = await db.prepare('SELECT clerk_user_id, party_id, amount_minor FROM party_donations WHERE request_id=?').bind(cmd.requestId).first<{ clerk_user_id: string; party_id: string; amount_minor: number }>();
  if (prior) return prior.clerk_user_id === userId && prior.party_id === cmd.partyId && Number(prior.amount_minor) === cmd.amountMinor ? { ok: true } : { ok: false, status: 409, error: 'That request was already used.', reason: 'request_reused' };
  if (cmd.amountMinor > donationWeeklyCapMinor) return capRefusal();
  await db.prepare(`INSERT INTO party_donations (request_id, clerk_user_id, party_id, amount_minor, week, donated_at)
    SELECT ?, ?, ?, ?, ?, ? WHERE COALESCE((SELECT balance FROM citizen_wallet_balances WHERE clerk_user_id=?), 0) >= ?
    AND COALESCE((SELECT SUM(amount_minor) FROM party_donations WHERE clerk_user_id=? AND party_id=? AND week=?), 0) + ? <= ?
    ON CONFLICT (request_id) DO NOTHING`).bind(cmd.requestId, userId, cmd.partyId, cmd.amountMinor, week, now, userId, cmd.amountMinor, userId, cmd.partyId, week, cmd.amountMinor, donationWeeklyCapMinor).run();
  const written = await db.prepare('SELECT 1 AS x FROM party_donations WHERE request_id=? AND clerk_user_id=?').bind(cmd.requestId, userId).first();
  if (written) return { ok: true };
  const balance = Number((await db.prepare('SELECT balance FROM citizen_wallet_balances WHERE clerk_user_id=?').bind(userId).first<{ balance: number }>())?.balance ?? 0);
  return balance < cmd.amountMinor ? { ok: false, status: 409, error: 'Not enough Spark in your wallet for that donation.', reason: 'insufficient_balance' } : capRefusal();
}
const capRefusal = (): Refusal => ({ ok: false, status: 409, error: `You can give at most ${(donationWeeklyCapMinor / 100).toFixed(2)} SPK to one party each week.`, reason: 'cap_reached' });
