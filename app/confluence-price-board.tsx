import type { PriceBoard } from '@/lib/confluence-price-band';

/** #487: read-only banded price board for one Confluence staple. Placeholder wording until Content supplies copy. */
export function ConfluencePriceBoard({ board }: { board: PriceBoard }) {
  const cur = (minor: number) => `${(minor / 100).toFixed(2)} ${board.currency}`;
  return <section className="citizen-market" aria-label="Banded price board">
    <h3>Banded price board</h3>
    <dl>
      <div><dt>{board.staple}</dt><dd>{cur(board.priceMinor)} per {board.unit}</dd></div>
      <div><dt>State price band</dt><dd>{cur(board.floorMinor)} to {cur(board.ceilingMinor)} (±{board.bandPct}%)</dd></div>
    </dl>
    <p>Staple prices stay inside the state band. This board is read-only.</p>
  </section>;
}
