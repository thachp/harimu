import type { ReserveBoard } from '@/lib/spark-supply';
import { reserveBoardRows } from '@/lib/reserve-board-view';
import { priceIndexExplainer } from '@/lib/reserve-board-copy';

/** #431: Kindle's published money figures (read-only; rendered only while HARIMU_SPARK_SUPPLY_ENABLED supplies `simulation.reserve`). */
export function ReserveBoardLine({ reserve }: { reserve: ReserveBoard }) {
  const view = reserveBoardRows(reserve);
  return <section aria-label={view.header}>
    <h4>{view.header}</h4>
    <ul>{view.rows.map(row => <li key={row}>{row}</li>)}</ul>
    <p>{view.caption}</p>
    <details><summary>{priceIndexExplainer.label}</summary>{priceIndexExplainer.lines.map(line => <p key={line.text}>{line.text}</p>)}</details>
  </section>;
}
