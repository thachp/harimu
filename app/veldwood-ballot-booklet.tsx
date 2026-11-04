import type { CSSProperties } from 'react';
import { nationCrest } from '../lib/nation-crests';
import { nationMark } from '../lib/nation-themes';
import { NationCrest } from './nation-crest';

/** #1088: Veldwood ballots as a wood-grain Ballot Booklet (docs §23.2). Build flag
 *  NEXT_PUBLIC_HARIMU_VELDWOOD_BALLOT_BOOKLET ("true" in preview, "false" in production),
 *  carried in HARIMU_UI_PACK. Only the exact string "true" enables it. No new ballot data. */
export function veldwoodBallotBookletEnabled(value: string | undefined = process.env.NEXT_PUBLIC_HARIMU_VELDWOOD_BALLOT_BOOKLET): boolean {
  return value === 'true';
}

const kindleBallotNote = 'Kindle’s preview ballot status is shown above. Protests and broader public-opinion systems are planned.';
const openBallotNote = 'This location has no counted ballot. Protests and broader public-opinion systems are planned under each nation’s rules.';

/** The ballot line the civic screen already shows. Kindle with an account keeps its sentence; every other nation, including Veldwood, keeps the open-ballot sentence. */
export function ballotStatusCopy(nationId: string, kindleAccount: boolean): string {
  return nationId === 'kindle' && kindleAccount ? kindleBallotNote : openBallotNote;
}

export function BallotStatus({ nationId, kindleAccount }: { nationId: string; kindleAccount: boolean }) {
  const text = ballotStatusCopy(nationId, kindleAccount);
  if (nationId === 'veldwood' && veldwoodBallotBookletEnabled()) return <VeldwoodBallotBooklet text={text} />;
  return <p>{text}</p>;
}

function ballotLines(text: string): string[] {
  return text.match(/[^.]+[.]/g)?.map(line => line.trim()) ?? [text];
}

/** Wood-grain cover and numbered pages. The sentences are the existing ballot line, split only so each page is one sentence. */
function VeldwoodBallotBooklet({ text }: { text: string }) {
  const mark = nationMark('veldwood'), crest = nationCrest('veldwood'), lines = ballotLines(text);
  const tokens = {
    '--veldwood-field': crest?.field, '--veldwood-mark': crest?.mark, '--veldwood-accent': crest?.accent, '--veldwood-leaf': mark?.accent,
  } as CSSProperties;
  return <section className="veldwood-ballot-booklet" aria-label="Veldwood Ballot Booklet" data-nation-pattern={mark?.pattern} style={tokens}>
    <header className="veldwood-ballot-cover">
      <span className="nation-symbol veldwood-ballot-mark" data-nation-pattern={mark?.pattern} aria-hidden="true" title={mark ? `${mark.name} symbol, ${mark.patternName}` : undefined}>{mark?.symbol}</span>
      <NationCrest id="veldwood" size={36} force labelled />
      <p className="veldwood-ballot-title" aria-hidden="true">Veldwood Ballot Booklet</p>
    </header>
    <ol className="veldwood-ballot-pages">{lines.map((line, index) => <li key={line} className="veldwood-ballot-page">
      <span className="veldwood-ballot-num" aria-hidden="true">{index + 1}</span><p>{line}</p>
    </li>)}</ol>
  </section>;
}
