import type { CSSProperties, ReactNode } from 'react';
import { nationCrest } from '../lib/nation-crests';
import { nationMark } from '../lib/nation-themes';
import type { GovernmentSnapshot } from '../lib/government';
import { NationCrest } from './nation-crest';

/** #1100: Fulmara votes as share certificates on a live ticker (docs §23.2).
 *  NEXT_PUBLIC_HARIMU_FULMARA_SHARE_TICKER is a HARIMU_UI_PACK key ("true" in preview, "false" in production).
 *  Layout bundles that omit the define have no `process`. A missing flag is off. */
export function fulmaraShareTickerFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_FULMARA_SHARE_TICKER; }
  catch { return undefined; }
}
export function fulmaraShareTickerEnabled(value: string | undefined = fulmaraShareTickerFlag()): boolean {
  return value === 'true';
}

export const FULMARA_NO_VOTES = 'No votes are open.';
export type ShareLine = { title: string; status: string };

/** The proposal the government panel already shows. No share tally exists on the Fulmara read
 *  (grandCouncil names election instants, not votes), so a missing snapshot is an empty register. */
export function fulmaraShareLines(snapshot: GovernmentSnapshot | null, spendingNote: string): ShareLine[] {
  if (!snapshot || snapshot.nationId !== 'fulmara') return [];
  return [{
    title: snapshot.decision.title,
    status: `Spending proposal: ${snapshot.decision.proposedSpendMinor} minor units from ${snapshot.availableBudgetMinor} available.${spendingNote}`,
  }];
}

function tickerText(line: ShareLine, blank: boolean): string {
  return blank ? line.status : `${line.title} · ${line.status}`;
}

/** Bordered certificate cards plus a ticker of the same statuses. The list is the non-animated text. */
export function FulmaraShareRegister({ lines, children }: { lines: ShareLine[]; children?: ReactNode }) {
  const mark = nationMark('fulmara'), crest = nationCrest('fulmara'), blank = lines.length === 0;
  const shown = blank ? [{ title: '', status: FULMARA_NO_VOTES }] : lines;
  const tokens = { '--fulmara-field': crest?.field, '--fulmara-mark': crest?.mark, '--fulmara-accent': crest?.accent, '--fulmara-stripe': mark?.accent } as CSSProperties;
  return <section className="fulmara-shares" aria-label="Fulmara share register" data-nation-pattern={mark?.pattern} style={tokens}>
    <div className="fulmara-ticker" aria-hidden="true">
      <div className="fulmara-ticker-track">
        <span className="fulmara-ticker-copy">{shown.map((line, index) => <span key={index} className="fulmara-ticker-item">{tickerText(line, blank)}</span>)}</span>
        <span className="fulmara-ticker-loop">{shown.map((line, index) => <span key={index} className="fulmara-ticker-item">{tickerText(line, blank)}</span>)}</span>
      </div>
    </div>
    <ul className="fulmara-share-list">{shown.map((line, index) => <li key={index}>
      <article className="fulmara-share">
        <header className="fulmara-share-head" data-nation-pattern={mark?.pattern}>
          <span className="nation-symbol fulmara-share-mark" data-nation-pattern={mark?.pattern} aria-hidden="true">{mark?.symbol}</span>
          <NationCrest id="fulmara" size={32} force labelled />
          <p className="fulmara-share-serial">Share certificate</p>
        </header>
        {line.title ? <h4 className="fulmara-share-title">{line.title}</h4> : null}
        <p className="fulmara-share-status">{line.status}</p>
        {blank ? children : null}
      </article>
    </li>)}</ul>
  </section>;
}
