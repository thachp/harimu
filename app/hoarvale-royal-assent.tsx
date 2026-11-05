'use client';
import type { CSSProperties } from 'react';
import { nationCrest } from '../lib/nation-crests';
import { nationMark } from '../lib/nation-themes';
import { useDisplayTimestamp } from './display-preferences';

/** #1064: Hoarvale bills in the Civic panel carry a frost-blue Royal Assent seal (docs §23.2).
 *  Build flag NEXT_PUBLIC_HARIMU_HOARVALE_ROYAL_ASSENT ("true" in preview, "false" in production),
 *  a HARIMU_UI_PACK key. Only the exact string "true" enables it. Layout bundles that omit the
 *  define have no `process`. Bills and assent come from the government read. No new bill list.
 *  assentAt is unix seconds on that read. A present instant is shown beside the seal in the same
 *  UTC timestamp other surfaces use. A missing date is omitted. */
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

type AssentBill = { title: string; assentStatus: string; assentAt?: number | null };

/** A safe unix-second assent instant, or nothing. The shared formatter owns the visible words. */
function assentDate(value: number | null | undefined, formatTime: (stamp: string | number) => string): { dateTime: string; label: string } | null {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return null;
  const ms = value * 1000;
  if (!Number.isSafeInteger(ms)) return null;
  const date = new Date(ms);
  if (!Number.isFinite(date.getTime())) return null;
  const label = formatTime(ms);
  return label === 'Time unavailable' ? null : { dateTime: date.toISOString(), label };
}

export function HoarvaleRoyalAssentBills({ nationId, bills }: {
  nationId: string;
  bills?: readonly AssentBill[] | null;
}) {
  const formatTime = useDisplayTimestamp();
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
      const dated = assentDate(bill.assentAt, formatTime);
      const name = dated ? `${bill.title}. ${text}. ${dated.label}` : `${bill.title}. ${text}`;
      return <li key={index} className="hoarvale-bill" data-assent={bill.assentStatus} aria-label={name}>
        <h4>{bill.title}</h4>
        <p className="hoarvale-assent">
          <span className="hoarvale-assent-seal">
            <span className="hoarvale-assent-mark" data-nation-pattern={seal?.pattern ?? 'plain'} aria-hidden="true">{icon}</span>
            <span className="hoarvale-assent-label">{text}</span>
            {dated ? <time className="hoarvale-assent-date" dateTime={dated.dateTime}>{dated.label}</time> : null}
          </span>
        </p>
      </li>;
    })}</ul>
  </section>;
}
