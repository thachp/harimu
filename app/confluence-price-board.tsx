import type { PriceBoard } from '@/lib/confluence-price-band';
import { priceBoard as copy } from '@/lib/confluence-market-copy';

/** #487 / #688: read-only banded price board for one Confluence staple. All wording from lib/confluence-market-copy.ts (Content, #687); figures from lib/confluence-price-band.ts. */
const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
/** board: undefined = flag off or citizen not allowlisted (the server sends no key; render nothing, as in #676); null = on and allowlisted but no posted price (empty state). */
export function ConfluencePriceBoard({ board }: { board?: PriceBoard | null }) {
  if (board === undefined) return null;
  if (!board) return <section className="citizen-market" aria-labelledby="confluence-price-board-heading">
    <h3 id="confluence-price-board-heading">{copy.title}</h3>
    <p>{copy.empty.text}</p>
  </section>;
  const cur = (minor: number) => `${(minor / 100).toFixed(2)} ${board.currency}`;
  const values = { staple: board.staple, portion: board.unit, price: cur(board.priceMinor), floor: cur(board.floorMinor), ceiling: cur(board.ceilingMinor), band: `${board.bandPct}%` };
  return <section className="citizen-market" aria-labelledby="confluence-price-board-heading">
    <h3 id="confluence-price-board-heading">{copy.title}</h3>
    <p>{fill(copy.stapleLine, values)}</p>
    <dl>
      <div><dt>{copy.postedPriceLabel}</dt><dd>{fill(copy.postedPriceValue, values)}</dd></div>
      <div><dt>{copy.bandLabel}</dt><dd>{fill(copy.bandValue, values)}</dd></div>
    </dl>
    <p>{copy.explainer.text}</p>
    <p>{copy.readOnly.text}</p>
  </section>;
}
