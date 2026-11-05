import type { CSSProperties } from 'react';
import { nationCrest } from '../lib/nation-crests';
import { nationMark } from '../lib/nation-themes';

/** #1064: Hoarvale bills in the Civic panel carry a frost-blue Royal Assent seal (docs §23.2).
 *  Build flag NEXT_PUBLIC_HARIMU_HOARVALE_ROYAL_ASSENT ("true" in preview, "false" in production),
 *  a HARIMU_UI_PACK key. Only the exact string "true" enables it. Layout bundles that omit the
 *  define have no `process`. Bills and assent come from the government read. No new bill list. */
export function hoarvaleRoyalAssentFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_HOARVALE_ROYAL_ASSENT; }
  catch { return undefined; }
}
export function hoarvaleRoyalAssentEnabled(value: string | undefined = hoarvaleRoyalAssentFlag()): boolean {
  return value === 'true';
}

const sealByStatus = {
  assented: { text: 'Royal Assent', pattern: 'chevrons', icon: '✚' },
  pending: { text: 'Awaiting Royal Assent', pattern: 'open-ring', icon: '○' },
  withheld: { text: 'Royal Assent withheld', pattern: 'cross', icon: '×' },
} as const;

export function HoarvaleRoyalAssentBills({ nationId, bills }: {
  nationId: string;
  bills?: readonly { title: string; assentStatus: string }[] | null;
}) {
  if (nationId !== 'hoarvale' || !hoarvaleRoyalAssentEnabled() || !bills?.length) return null;
  const mark = nationMark('hoarvale'), crest = nationCrest('hoarvale');
  const style = {
    '--hv-paper': '#f4f7f8', '--hv-ink': '#14323a', '--hv-frost': crest?.field ?? '#3f7898',
    '--hv-silver': crest?.accent ?? '#b8c2c9', '--hv-accent': mark?.accent ?? '#8ac1c6',
  } as CSSProperties;
  return <section className="hoarvale-bills" style={style} aria-label="Moot bills">
    <h3>Moot bills</h3>
    <ul>{bills.map((bill, index) => {
      const seal = sealByStatus[bill.assentStatus as keyof typeof sealByStatus];
      const text = seal?.text ?? bill.assentStatus;
      const icon = bill.assentStatus === 'assented' ? (mark?.symbol ?? '✚') : (seal?.icon ?? '·');
      return <li key={index} className="hoarvale-bill" data-assent={bill.assentStatus} aria-label={`${bill.title}. ${text}`}>
        <h4>{bill.title}</h4>
        <p className="hoarvale-assent">
          <span className="hoarvale-assent-seal">
            <span className="hoarvale-assent-mark" data-nation-pattern={seal?.pattern ?? 'plain'} aria-hidden="true">{icon}</span>
            <span className="hoarvale-assent-label">{text}</span>
          </span>
        </p>
      </li>;
    })}</ul>
  </section>;
}
