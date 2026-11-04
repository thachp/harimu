import type { CSSProperties } from 'react';
import { nationCrest } from '../lib/nation-crests';
import { nationMark } from '../lib/nation-themes';

/** #1064: Hoarvale bills in the Civic panel carry a frost-blue Royal Assent seal (docs §23.2).
 *  Build flag NEXT_PUBLIC_HARIMU_HOARVALE_ROYAL_ASSENT ("true" in preview, "false" in production),
 *  a HARIMU_UI_PACK key expanded into the client bundle. Only the exact string "true" enables it.
 *  Layout bundles that omit the define have no `process`. A missing flag is off. No assent clock and no new endpoint. */
export function hoarvaleRoyalAssentFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_HOARVALE_ROYAL_ASSENT; }
  catch { return undefined; }
}
export function hoarvaleRoyalAssentEnabled(value: string | undefined = hoarvaleRoyalAssentFlag()): boolean {
  return value === 'true';
}

/** Published Moot papers already named in the Hoarvale record. Status is a label on the paper, not a rule. */
export const hoarvaleCivicBills = [
  { id: 'inflation-band', title: 'Inflation band', assent: 'assented' },
  { id: 'moot-tax', title: 'Moot tax', assent: 'pending' },
] as const;
const assentLabel = { assented: 'Royal Assent', pending: 'Awaiting Royal Assent' } as const;

export function HoarvaleCivicBills({ nationId }: { nationId: string }) {
  if (nationId !== 'hoarvale' || !hoarvaleRoyalAssentEnabled()) return null;
  const mark = nationMark('hoarvale'), crest = nationCrest('hoarvale');
  const style = { '--hv-paper': '#f4f7f8', '--hv-ink': '#14323a', '--hv-frost': crest?.field ?? '#3f7898', '--hv-silver': crest?.accent ?? '#b8c2c9', '--hv-accent': mark?.accent ?? '#8ac1c6' } as CSSProperties;
  return <section className="hoarvale-bills" style={style} aria-label="Moot bills">
    <h3>Moot bills</h3>
    <ul>{hoarvaleCivicBills.map(bill => {
      const text = assentLabel[bill.assent], assented = bill.assent === 'assented';
      return <li key={bill.id} className="hoarvale-bill" data-assent={bill.assent}>
        <h4>{bill.title}</h4>
        <p className="hoarvale-assent" role="status" aria-label={text}>
          <span className="hoarvale-assent-seal">
            <span className="hoarvale-assent-mark" data-nation-pattern={assented ? 'chevrons' : 'open-ring'} aria-hidden="true">{assented ? mark?.symbol ?? '✚' : '○'}</span>
            <span className="hoarvale-assent-label">{text}</span>
          </span>
        </p>
      </li>;
    })}</ul>
  </section>;
}
