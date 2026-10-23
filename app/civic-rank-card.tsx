// #741: the Kindle civic rank (docs §11.6): an honor, never an office. Shown only when GET /api/citizen sends civicRank (Kindle, HARIMU_CIVIC_RANK_ENABLED on).
import type { CivicRank } from '@/lib/civic-rank-rules';

const spk = (minor: number) => `${(minor / 100).toFixed(0)} SPK`;
export function CivicRankCard({ civicRank }: { civicRank?: CivicRank | null }) {
  if (!civicRank) return null;
  const { have, needs } = civicRank.progress;
  const rows = needs ? ([['Settled shifts', have.shifts, needs.shifts, String], ['Civic acts (signatures, ballots)', have.civicActs, needs.civicActs, String], ['Wallet', have.walletMinor, needs.walletMinor, spk]] as const)
    .filter(([, , need]) => need > 0) : [];
  return <section className="civic-rank-card" aria-label="Civic rank">
    <h3>Civic rank: {civicRank.rank}</h3>
    {civicRank.next ? <><p>Toward {civicRank.next}:</p>
      <ul>{rows.map(([label, value, need, fmt]) => <li key={label} data-met={value >= need ? 'true' : undefined}>{label}: {fmt(Math.min(value, need))} of {fmt(need)}</li>)}</ul></>
      : <p>The highest civic rank in Kindle.</p>}
    <p className="civic-rank-note">An honor of the Republic. It grants no office or vote weight.</p>
  </section>;
}
