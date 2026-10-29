import type { ReactNode } from 'react';

/** #1009: Kindle ballots as a modern civic form (docs §23.2). Build flag NEXT_PUBLIC_HARIMU_KINDLE_CIVIC_BALLOT
 *  ("true" in preview, "false" in production), carried in HARIMU_UI_PACK and expanded into the client bundle.
 *  Only the exact string "true" enables it. No new ballot data. */
export function kindleCivicBallotEnabled(value: string | undefined = process.env.NEXT_PUBLIC_HARIMU_KINDLE_CIVIC_BALLOT): boolean {
  return value === 'true';
}

/** Numbered choice group. The legend keeps the existing prompt; the numeral is the field number. */
export function KindleCivicField({ n, legend, children }: { n: number; legend: string; children: ReactNode }) {
  return <fieldset className="kindle-civic-field"><legend><span className="kindle-civic-num">{n}</span> {legend}</legend><div className="kindle-civic-options">{children}</div></fieldset>;
}

export function KindleCivicChoice({ name, value, checked, disabled, describedBy, onChange, children }: {
  name: string; value: string; checked: boolean; disabled?: boolean; describedBy?: string; onChange: () => void; children: ReactNode;
}) {
  return <label className="kindle-civic-choice"><input type="radio" name={name} value={value} checked={checked} disabled={disabled} aria-describedby={describedBy} onChange={onChange} /><span>{children}</span></label>;
}

/** Summary row. The heading is the accessible name; the numeral is decorative. */
export function KindleCivicReview({ n, summary, children }: { n: number; summary: ReactNode; children: ReactNode }) {
  return <div className="kindle-civic-review"><p className="kindle-civic-review-title"><span className="kindle-civic-num" aria-hidden="true">{n}</span>Review and cast</p><p className="kindle-civic-summary">{summary}</p>{children}</div>;
}
