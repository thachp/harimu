/** #741: civic rank ladders (docs §11.6 Progression ladders: honors and privileges, never office). Pure and import-free; slice 1 is Kindle only.
 *  A ladder is data, so Korund and Aurelle can be added as entries later. Ranks are derived on read and grant no gameplay power: no module reads a rank to decide anything. */
export type CivicInputs = { shifts: number; civicActs: number; walletMinor: number };
export type CivicStep = { rank: string; needs: CivicInputs };
/** [ASSUMPTION] Thresholds: the docs name the ranks ("Wealth, reputation, civic participation") but give no numbers. This is the one place they live (pinned by
 *  tests/civic-rank-741.test.mjs). shifts = settled work shifts, civicActs = petition signatures + written ballots (general, preview, primary), walletMinor = SPK minor units (100 = 1 SPK). */
export const civicLadders: Readonly<Record<string, readonly CivicStep[]>> = {
  kindle: [
    { rank: 'Resident', needs: { shifts: 0, civicActs: 0, walletMinor: 0 } },
    { rank: 'Citizen', needs: { shifts: 3, civicActs: 0, walletMinor: 0 } },
    { rank: 'Emberwarden', needs: { shifts: 10, civicActs: 2, walletMinor: 0 } },
    { rank: 'Leading Citizen', needs: { shifts: 30, civicActs: 6, walletMinor: 50000 } },
  ],
};
export type CivicRank = { rank: string; next: string | null; progress: { have: CivicInputs; needs: CivicInputs | null } };
const meets = (have: CivicInputs, needs: CivicInputs) => have.shifts >= needs.shifts && have.civicActs >= needs.civicActs && have.walletMinor >= needs.walletMinor;
/** The highest step whose every threshold is met (steps are cumulative), and what the next step needs. null for a nation without a ladder. */
export function civicRank(nationId: string | null | undefined, input: CivicInputs): CivicRank | null {
  const ladder = nationId ? civicLadders[nationId] : undefined;
  if (!ladder) return null;
  const have = { shifts: Math.max(0, Math.floor(input.shifts || 0)), civicActs: Math.max(0, Math.floor(input.civicActs || 0)), walletMinor: Math.max(0, Math.floor(input.walletMinor || 0)) };
  let at = 0;
  while (at + 1 < ladder.length && meets(have, ladder[at + 1].needs)) at++;
  const next = ladder[at + 1];
  return { rank: ladder[at].rank, next: next?.rank ?? null, progress: { have, needs: next?.needs ?? null } };
}
export const civicRankFlagOn = (env: unknown) => (env as { HARIMU_CIVIC_RANK_ENABLED?: string }).HARIMU_CIVIC_RANK_ENABLED === 'true';
/** One aggregate read (no new table): settled shifts, civic acts and the SPK wallet. Same SQL on SQLite and Postgres. */
export const civicInputsSql = `SELECT (SELECT COUNT(*) FROM work_shifts WHERE clerk_user_id=? AND claimed_at IS NOT NULL) AS shifts,
 (SELECT COUNT(*) FROM civic_petition_signatures WHERE clerk_user_id=?)+(SELECT COUNT(*) FROM civic_voter_receipts WHERE clerk_user_id=? AND ballot_written=1)
 +(SELECT COUNT(*) FROM poc_voter_receipts WHERE clerk_user_id=? AND ballot_written=1)+(SELECT COUNT(*) FROM primary_voter_receipts WHERE clerk_user_id=? AND ballot_written=1) AS civic_acts,
 COALESCE((SELECT balance FROM citizen_wallet_balances WHERE clerk_user_id=?),0) AS wallet_minor`;
/** First-week `kindle-7-rank` is complete once the rank is Citizen or above (a ledger probe; Citizen needs shifts only, pinned by a test). */
export const citizenRankShifts = civicLadders.kindle[1].needs.shifts;
