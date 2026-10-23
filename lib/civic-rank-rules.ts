/** #741: civic rank ladders (docs §11.6 Progression ladders: honors and privileges, never office). Pure and import-free; slice 1 is Kindle only.
 *  A ladder is data, so Korund and Aurelle can be added as entries later. Ranks are derived on read and grant no gameplay power: no module reads a rank to decide anything. */
export type CivicInputs = { shifts: number; civicActs: number; walletMinor: number };
export type CivicStep = { rank: string; needs: CivicInputs };
/** [ASSUMPTION] Thresholds (approved by ARC on #778): the docs name the ranks but give no numbers. Named exports are the one place they live (pinned by
 *  tests/civic-rank-741.test.mjs). walletMinor = SPK minor units (100 = 1 SPK). */
export const CITIZEN_MIN_SHIFTS = 3;
export const EMBERWARDEN_MIN_SHIFTS = 10;
export const EMBERWARDEN_MIN_CIVIC_ACTS = 2;
export const LEADING_CITIZEN_MIN_SHIFTS = 30;
export const LEADING_CITIZEN_MIN_CIVIC_ACTS = 6;
export const LEADING_CITIZEN_MIN_WALLET_MINOR = 50000;
export const civicLadders: Readonly<Record<string, readonly CivicStep[]>> = {
  kindle: [
    { rank: 'Resident', needs: { shifts: 0, civicActs: 0, walletMinor: 0 } },
    { rank: 'Citizen', needs: { shifts: CITIZEN_MIN_SHIFTS, civicActs: 0, walletMinor: 0 } },
    { rank: 'Emberwarden', needs: { shifts: EMBERWARDEN_MIN_SHIFTS, civicActs: EMBERWARDEN_MIN_CIVIC_ACTS, walletMinor: 0 } },
    { rank: 'Leading Citizen', needs: { shifts: LEADING_CITIZEN_MIN_SHIFTS, civicActs: LEADING_CITIZEN_MIN_CIVIC_ACTS, walletMinor: LEADING_CITIZEN_MIN_WALLET_MINOR } },
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
/** One aggregate read (no new table): settled shifts, civic acts and the SPK wallet. Same SQL on SQLite and Postgres.
 *  [ASSUMPTION] docs §11.6 ranks on "Wealth, reputation, civic participation". No reputation score exists yet, so settled work shifts stand in for
 *  reputation (ARC ruling on #778). When a real reputation score lands, swap the `shifts` input for it here and in CivicInputs.
 *  Each civic act counts once: COUNT(DISTINCT ...) gives one signature per petition and one written receipt per ballot, even if duplicate rows ever appear
 *  (the PKs on (petition_id|election_id, clerk_user_id) already forbid them today). */
export const civicInputsSql = `SELECT (SELECT COUNT(*) FROM work_shifts WHERE clerk_user_id=? AND claimed_at IS NOT NULL) AS shifts,
 (SELECT COUNT(DISTINCT petition_id) FROM civic_petition_signatures WHERE clerk_user_id=?)+(SELECT COUNT(DISTINCT election_id) FROM civic_voter_receipts WHERE clerk_user_id=? AND ballot_written=1)
 +(SELECT COUNT(DISTINCT election_id) FROM poc_voter_receipts WHERE clerk_user_id=? AND ballot_written=1)+(SELECT COUNT(DISTINCT election_id) FROM primary_voter_receipts WHERE clerk_user_id=? AND ballot_written=1) AS civic_acts,
 COALESCE((SELECT balance FROM citizen_wallet_balances WHERE clerk_user_id=?),0) AS wallet_minor`;
/** First-week `kindle-7-rank` is complete once the rank is Citizen or above (a ledger probe; Citizen needs shifts only, pinned by a test). */
export const citizenRankShifts = CITIZEN_MIN_SHIFTS;
