'use client';
import type { ReactNode } from 'react';
import { CaretRight } from '@phosphor-icons/react';
import './panel-v2.css';

/** #392 S3: the concept's panel shape. The crest is not repeated here: the inspector header above already shows it (S1). Every string comes from the caller (existing content); this component adds no copy. */
export type PanelStat = { label: string; value: ReactNode };
export type PanelRow = { id: string; label: string; detail?: string; onSelect: () => void };
export function PanelV2({ nationId, title, subtitle, stats, rows, rowsLabel, primary }: { nationId: string; title: string; subtitle?: string; stats: PanelStat[]; rows: PanelRow[]; rowsLabel: string; primary?: { label: string; onSelect: () => void } }) {
  return <section className="panel-v2" aria-label={title}>
    <header className="panel-v2-summary" data-nation={nationId}><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div></header>
    {stats.length > 0 && <dl className="panel-v2-stats">{stats.map(stat => <div key={stat.label}><dt>{stat.label}</dt><dd>{stat.value}</dd></div>)}</dl>}
    {rows.length > 0 && <ul className="panel-v2-rows" aria-label={rowsLabel}>{rows.map(row => <li key={row.id}><button type="button" onClick={row.onSelect}><span><strong>{row.label}</strong>{row.detail && <small>{row.detail}</small>}</span><CaretRight size={18} aria-hidden="true" /></button></li>)}</ul>}
    {primary && <button type="button" className="panel-v2-primary" onClick={primary.onSelect}><span>{primary.label}</span><CaretRight size={18} aria-hidden="true" /></button>}
  </section>;
}
