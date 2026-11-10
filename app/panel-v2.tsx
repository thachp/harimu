'use client';
import type { ReactNode } from 'react';
import { CaretRight } from '@phosphor-icons/react';
import './panel-v2.css';

/** #392 S3: the concept's panel shape. The crest is not repeated here: the inspector header above already shows it (S1). Every string comes from the caller (existing content); this component adds no copy. */
export type PanelStat = { label: string; value: ReactNode; icon?: ReactNode; id?: string; spoken?: string; detail?: ReactNode };
export type PanelRow = { id: string; label: string; detail?: string; pressed?: boolean; icon?: ReactNode; onSelect: () => void };
/** #392 UI 40 chips, shared with the Nation header (UI 41). An empty list renders nothing, so the row stays off. */
export function HeaderStatChips({ stats }: { stats?: PanelStat[] | null }) {
  if (!stats?.length) return null;
  return <dl className="panel-v2-header-stats">{stats.map(stat => <div key={stat.id ?? stat.label}><dt>{stat.icon && <span className="panel-v2-icon" aria-hidden="true">{stat.icon}</span>}{stat.spoken && <span className="panel-v2-header-spoken">{stat.spoken}</span>}<span aria-hidden={stat.spoken ? true : undefined}>{stat.label}</span></dt><dd>{stat.value}{stat.detail ? <small>{stat.detail}</small> : null}</dd></div>)}</dl>;
}
type PanelPrimary = { label: string; ariaLabel?: string; icon?: ReactNode; onSelect: () => void; tone?: 'primary' | 'secondary' };
function panelPrimary(primary: PanelPrimary) {
  return <button type="button" className={primary.tone === 'secondary' ? 'panel-v2-secondary' : 'panel-v2-primary'} aria-label={primary.ariaLabel} onClick={primary.onSelect}>{primary.icon && <span className="panel-v2-icon" aria-hidden="true">{primary.icon}</span>}<span>{primary.label}</span><CaretRight size={18} aria-hidden="true" /></button>;
}
/** #392 UI 44: City identity adds an optional mark, tagline, and kicker. Other panels omit them, so their markup stays as it is. */
export function PanelV2({ title, subtitle, stats, rows, rowsLabel, primary, headerStats, mark, tagline, primaryKicker }: { title: string; subtitle?: string; stats: PanelStat[]; rows: PanelRow[]; rowsLabel: string; primary?: PanelPrimary; headerStats?: PanelStat[]; mark?: ReactNode; tagline?: string | null; primaryKicker?: string | null }) {
  const city = Boolean(mark || tagline || primaryKicker);
  return <section className={city ? 'panel-v2 panel-v2-city' : 'panel-v2'} aria-label={title}>
    <header className={mark || tagline ? 'panel-v2-summary panel-v2-city-head' : 'panel-v2-summary'}>{mark ? <span className="panel-v2-city-mark" aria-hidden="true">{mark}</span> : null}<div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{tagline ? <p className="panel-v2-city-tagline">{tagline}</p> : null}<HeaderStatChips stats={headerStats} /></header>
    {stats.length > 0 && <dl className={stats.some(stat => stat.icon) ? 'panel-v2-stats panel-v2-facts' : 'panel-v2-stats'}>{stats.map(stat => <div key={stat.label}><dt>{stat.icon && <span className="panel-v2-icon" aria-hidden="true">{stat.icon}</span>}{stat.label}</dt><dd>{stat.value}</dd></div>)}</dl>}
    {rows.length > 0 && <ul className="panel-v2-rows" aria-label={rowsLabel}>{rows.map(row => <li key={row.id}><button type="button" aria-pressed={row.pressed} onClick={row.onSelect}>{row.icon && <span className="panel-v2-icon" aria-hidden="true">{row.icon}</span>}<span><strong>{row.label}</strong>{row.detail && <small>{row.detail}</small>}</span><CaretRight size={18} aria-hidden="true" /></button></li>)}</ul>}
    {primary ? primaryKicker ? <div className="panel-v2-city-action"><p className="panel-v2-city-kicker">{primaryKicker}</p>{panelPrimary(primary)}</div> : panelPrimary(primary) : null}
  </section>;
}
