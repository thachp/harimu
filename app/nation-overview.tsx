'use client';
import { Bank, BookOpen, Coins, UsersThree } from '@phosphor-icons/react';
import { NationCrest } from './nation-crest';
import { ExplorePrimaryButton } from './explore-primary';
import { HeaderStatChips } from './panel-v2';
import { nationOverviewFields, type NationOverviewGovernment, type NationOverviewNation } from '@/lib/nation-overview';
import { nationHeaderStats, nationHeaderStatsEnabled } from '@/lib/nation-header-stats';
import { nationActionsEnabled } from '@/lib/nation-actions';
import { nationActionIconsEnabled } from '@/lib/nation-action-icons';
import { nationActionsStackEnabled } from '@/lib/nation-actions-stack';
import { nationMottoEnabled } from '@/lib/nation-motto';
import './nation-overview.css';

const headerIcon = { stability: UsersThree, capital: Bank, currency: Coins } as const;

function NationActions({ explore, onExplore, onInstitutions, actionIcons, actionsStack }: { explore: string | null; onExplore: () => void; onInstitutions?: () => void; actionIcons: boolean; actionsStack: boolean }) {
  const primary = explore ? <ExplorePrimaryButton label={explore} ariaLabel={`${explore}: open the city`} onClick={onExplore} chevron {...(actionIcons ? { leadingIcon: <Bank size={18} aria-hidden="true" /> } : {})} /> : null;
  const secondary = onInstitutions ? <button type="button" className="nation-overview-secondary" onClick={onInstitutions}>{actionIcons ? <BookOpen size={18} aria-hidden="true" /> : null}View institutions</button> : null;
  if (!primary && !secondary) return null;
  const row = ['nation-overview-actions'];
  if (actionIcons) row.push('nation-overview-action-icons');
  if (actionsStack) row.push('nation-overview-actions-stack');
  return <div className={row.join(' ')}>{primary}{secondary}</div>;
}

/** #1166: the nation-view side panel. Every value comes from the nation record or that nation's government read.
 *  #392 UI 41: with NEXT_PUBLIC_HARIMU_NATION_HEADER_STATS, Stability, Capital and Currency move into header chips and the old trio is not repeated. Flag off keeps this panel as it is.
 *  #392 UI 42: with NEXT_PUBLIC_HARIMU_NATION_ACTIONS, Explore {capital} is the shared gold primary with a trailing chevron.
 *  View institutions is rendered only when the caller passes the institutions destination. Flag off keeps the outlined Explore button.
 *  #392 UI 45: with NEXT_PUBLIC_HARIMU_NATION_MOTTO, the nation motto sits to the right of the title. A blank motto stays hidden. Flag off keeps it under the name.
 *  #392 UI 53: with NEXT_PUBLIC_HARIMU_NATION_ACTION_ICONS, and only while that action row is on, Explore {capital} leads with a bank mark and keeps the chevron. View institutions leads with a book. A missing flag leaves the row as it is.
 *  #392 UI 54: with NEXT_PUBLIC_HARIMU_NATION_ACTIONS_STACK, and only while that action row is on, the two buttons size from their words and wrap onto a full-width row before a word is clipped. A missing flag leaves the row as it is. */
export function NationOverview({ nation, government = null, onExplore, onCivic, onInstitutions, actionIcons = nationActionIconsEnabled(), actionsStack = nationActionsStackEnabled() }: {
  nation: NationOverviewNation;
  government?: NationOverviewGovernment;
  onExplore: () => void;
  onCivic: () => void;
  onInstitutions?: () => void;
  actionIcons?: boolean;
  actionsStack?: boolean;
}) {
  const fields = nationOverviewFields(nation, government);
  const headerOn = nationHeaderStatsEnabled();
  const actionsOn = nationActionsEnabled();
  const mottoAside = nationMottoEnabled() ? fields.motto : null;
  const chips = headerOn ? nationHeaderStats(fields).map(stat => { const Icon = headerIcon[stat.id]; return { ...stat, icon: <Icon size={16} /> }; }) : [];
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
    <header className={['nation-overview-head', chips.length > 0 ? 'nation-overview-head-chips' : '', mottoAside ? 'nation-overview-head-tagline' : ''].filter(Boolean).join(' ')}>
      <NationCrest id={nation.id} size={56} force labelled />
      <div>
        {fields.name && <h2>{fields.name}</h2>}
        <p className="nation-overview-kicker">Nation overview</p>
        {!mottoAside && fields.motto && <p className="nation-overview-motto">{fields.motto}</p>}
      </div>
      {mottoAside && <p className="nation-overview-tagline">{mottoAside}</p>}
      <HeaderStatChips stats={chips} />
    </header>
    {!headerOn && stats.length > 0 && <dl className="nation-overview-stats">{stats.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
    {rows.length > 0 && <dl className="nation-overview-rows">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
    {fields.institutions.length > 0 && <ul className="nation-overview-institutions" aria-label="Institutions">{fields.institutions.map(item => <li key={item.id}><button type="button" onClick={onCivic}>{item.name}</button></li>)}</ul>}
    {actionsOn ? <NationActions explore={fields.explore} onExplore={onExplore} onInstitutions={onInstitutions} actionIcons={actionIcons} actionsStack={actionsStack} /> : fields.explore && <button type="button" className="nation-overview-primary" aria-label={`${fields.explore}: open the city`} onClick={onExplore}>{fields.explore}</button>}
  </section>;
}
