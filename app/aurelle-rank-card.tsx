// #1359: Aurelle noble ranks (docs §11.6): honors only, never office. Shown only when GET /api/citizen sends aurelleRank.
import type { AurelleRank } from '@/lib/aurelle-rank';
import { rankChrome, rankFor } from '@/lib/aurelle-rank-copy';

export function AurelleRankCard({ aurelleRank }: { aurelleRank?: AurelleRank | null }) {
  if (!aurelleRank) return null;
  return <section className="aurelle-rank-card" aria-label={rankChrome.title}>
    <h3>{rankChrome.title}: {aurelleRank.rank}</h3>
    {aurelleRank.next ? <p>Toward {aurelleRank.next}: {aurelleRank.earned} of {aurelleRank.needs}</p>
      : <p>{rankFor('baron')!.what.text}</p>}
    <p>{rankChrome.howEarned.text}</p>
    <p>{rankChrome.noJurisdiction.text}</p>
    <p>{rankChrome.aboveTheLadder.text}</p>
  </section>;
}
