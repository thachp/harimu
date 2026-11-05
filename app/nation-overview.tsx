'use client';
import { NationCrest } from './nation-crest';
import { nationOverviewFields, type NationOverviewGovernment, type NationOverviewNation } from '@/lib/nation-overview';
import './nation-overview.css';

/** #1166: the nation-view side panel. Every value comes from the nation record or that nation's government read. */
export function NationOverview({ nation, government = null, onExplore, onCivic }: {
  nation: NationOverviewNation;
  government?: NationOverviewGovernment;
  onExplore: () => void;
  onCivic: () => void;
}) {
  const fields = nationOverviewFields(nation, government);
  const stats = [
    fields.stability !== null ? ['Stability', `${fields.stability} / 100`] as const : null,
    fields.capital ? ['Capital', fields.capital] as const : null,
    fields.currency ? ['Currency', fields.currency] as const : null,
  ].filter(row => row !== null);
  const rows = [
    fields.government ? ['Government', fields.government] as const : null,
    fields.economy ? ['Economy', fields.economy] as const : null,
    fields.faith ? ['Faith', fields.faith] as const : null,
  ].filter(row => row !== null);
  return <section className="nation-overview" aria-label={fields.name ? `${fields.name} overview` : 'Nation overview'}>
    <header className="nation-overview-head">
      <NationCrest id={nation.id} size={56} force labelled />
      <div>
        {fields.name && <h2>{fields.name}</h2>}
        <p className="nation-overview-kicker">Nation overview</p>
        {fields.motto && <p className="nation-overview-motto">{fields.motto}</p>}
      </div>
    </header>
    {stats.length > 0 && <dl className="nation-overview-stats">{stats.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
    {rows.length > 0 && <dl className="nation-overview-rows">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
    {fields.institutions.length > 0 && <ul className="nation-overview-institutions" aria-label="Institutions">{fields.institutions.map(item => <li key={item.id}><button type="button" onClick={onCivic}>{item.name}</button></li>)}</ul>}
    {fields.explore && <button type="button" className="nation-overview-primary" aria-label={`${fields.explore}: open the city`} onClick={onExplore}>{fields.explore}</button>}
  </section>;
}
