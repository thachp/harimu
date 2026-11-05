import { nationMark } from '../lib/nation-themes';

/** #1124: Ilmar Prism contracts show a Lightshare profit share, not interest (docs §23.2, §7.6).
 *  NEXT_PUBLIC_HARIMU_ILMAR_PRISM_SHARES is a HARIMU_UI_PACK key ("true" in preview, "false" in production).
 *  Layout bundles that omit the define have no `process`. A missing flag is off.
 *  Data gap: GovernmentSnapshot has no contract, lease, or sharePercent field (sanctum is a calendar only).
 *  The panel therefore passes no rows. A future read would fill `contracts[].title` and an integer
 *  `contracts[].sharePercent` from 0 to 100. This module never invents a rate. */
export function ilmarPrismSharesFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_ILMAR_PRISM_SHARES; }
  catch { return undefined; }
}
export function ilmarPrismSharesEnabled(value: string | undefined = ilmarPrismSharesFlag()): boolean {
  return value === 'true';
}

export const ILMAR_PRISM_EMPTY = 'Profit shares appear when a Lightshare partnership exists.';
export type PrismContract = { title?: string | null; sharePercent?: number | null };
export type PrismShareLine = { title: string; percent: number | null };

/** Whole percent already on a row. Anything else is unposted, not rounded into a rate. */
export function postedSharePercent(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100 ? value : null;
}

/** Null hides the slot (flag off, or not Ilmar). An empty array is the honest empty finance slot. */
export function ilmarPrismLines(nationId: string | undefined, contracts: readonly PrismContract[] | null | undefined, enabled = ilmarPrismSharesEnabled()): PrismShareLine[] | null {
  if (!enabled || nationId !== 'ilmar') return null;
  if (!contracts?.length) return [];
  const lines: PrismShareLine[] = [];
  for (const row of contracts) {
    const title = typeof row?.title === 'string' ? row.title.trim() : '';
    if (!title) continue;
    lines.push({ title, percent: postedSharePercent(row.sharePercent) });
  }
  return lines;
}

function shareText(line: PrismShareLine): string {
  return line.percent == null ? 'Share not posted' : `Lightshare, ${line.percent} percent profit share`;
}

/** Counting-house slot. Posted and unposted rows differ by words. The slot does not animate. */
export function IlmarPrismShares({ nationId = 'ilmar', contracts = null }: { nationId?: string; contracts?: readonly PrismContract[] | null }) {
  const lines = ilmarPrismLines(nationId, contracts);
  if (!lines) return null;
  const mark = nationMark('ilmar');
  const pattern = mark?.pattern ?? 'dots';
  return <section className="ilmar-prism-shares" aria-label="Prism contracts" data-nation-pattern={pattern}>
    <header className="ilmar-prism-band">
      <span className="nation-symbol ilmar-prism-mark" data-nation-pattern={pattern} aria-hidden="true">{mark?.symbol}</span>
      <h3>Prism contracts</h3>
    </header>
    {lines.length === 0 ? <p className="ilmar-prism-empty" tabIndex={0}>{ILMAR_PRISM_EMPTY}</p> : <ul className="ilmar-prism-list" aria-label="Lightshare partnerships">{lines.map((line, index) => <li key={index} className="ilmar-prism-row" tabIndex={0} data-share={line.percent == null ? 'unposted' : 'posted'} data-nation-pattern={pattern} aria-label={`${line.title}. ${shareText(line)}`}>
      <h4>{line.title}</h4>
      <p><span className="ilmar-prism-kind">{line.percent == null ? 'Share not posted' : 'Lightshare'}</span>{line.percent == null ? null : <span className="ilmar-prism-figure">{line.percent}% profit share</span>}</p>
    </li>)}</ul>}
  </section>;
}
