'use client';
import type { ReactNode } from 'react';
import { CaretRight } from '@phosphor-icons/react';
import './panel-v2.css';

/** #392 S3: the concept's panel shape. The crest is not repeated here: the inspector header above already shows it (S1). Every string comes from the caller (existing content); this component adds no copy. */
export type PanelStat = { label: string; value: ReactNode };
export type PanelRow = { id: string; label: string; detail?: string; pressed?: boolean; icon?: ReactNode; onSelect: () => void };
export function PanelV2({ title, subtitle, stats, rows, rowsLabel, primary }: { title: string; subtitle?: string; stats: PanelStat[]; rows: PanelRow[]; rowsLabel: string; primary?: { label: string; ariaLabel?: string; icon?: ReactNode; onSelect: () => void } }) {
  return <section className="panel-v2" aria-label={title}>
    <header className="panel-v2-summary"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div></header>
    {stats.length > 0 && <dl className="panel-v2-stats">{stats.map(stat => <div key={stat.label}><dt>{stat.label}</dt><dd>{stat.value}</dd></div>)}</dl>}
    {rows.length > 0 && <ul className="panel-v2-rows" aria-label={rowsLabel}>{rows.map(row => <li key={row.id}><button type="button" aria-pressed={row.pressed} onClick={row.onSelect}>{row.icon && <span className="panel-v2-icon" aria-hidden="true">{row.icon}</span>}<span><strong>{row.label}</strong>{row.detail && <small>{row.detail}</small>}</span><CaretRight size={18} aria-hidden="true" /></button></li>)}</ul>}
    {primary && <button type="button" className="panel-v2-primary" aria-label={primary.ariaLabel} onClick={primary.onSelect}>{primary.icon && <span className="panel-v2-icon" aria-hidden="true">{primary.icon}</span>}<span>{primary.label}</span><CaretRight size={18} aria-hidden="true" /></button>}
  </section>;
}
