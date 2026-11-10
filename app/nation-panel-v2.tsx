'use client';
import { useState, type ComponentProps } from 'react';
import { Bank, Buildings, ChartLineUp, Coins } from '@phosphor-icons/react';
import { NationInstitutions, institutionSystems } from './nation-institutions';
import { PanelV2 } from './panel-v2';
import { nationFactRowsEnabled } from '@/lib/nation-fact-rows';
import { nationHeaderStatsEnabled } from '@/lib/nation-header-stats';
import { exploreNationLabels, uiV2NationEnabled } from '@/lib/ui-v2-nation';

/** #392 S6: the Nation panel. Flag off: exactly the existing NationInstitutions. Flag on: the S3 panel shape on top (name, motto, fact rows,
 *  the institution systems as chevron rows, "Explore {nation}" to the nation map), then the same NationInstitutions with its system picker replaced by the rows.
 *  #1076: NEXT_PUBLIC_HARIMU_NATION_FACT_ROWS lists Capital, Government, Economy, Currency (existing nation fields, currency still cut at ' · ').
 *  Off: today's Capital and Currency only. #392 UI 41: while the nation header chips are on, Capital and Currency are not repeated in these fact rows.
 *  Reads the build-time flags itself, so page.tsx never decides them. Existing lore only, plus Content's approved "Explore" copy. */
export function NationPanel({ onNationMap, enabled = uiV2NationEnabled(), ...props }: ComponentProps<typeof NationInstitutions> & { onNationMap: () => void; enabled?: boolean }) {
  const [systemId, setSystemId] = useState('capital');
  if (!enabled) return <NationInstitutions {...props} />;
  const { nation } = props, systems = institutionSystems(nation), explore = exploreNationLabels(nation.shortName);
  const currency = nation.currency.split(' · ')[0];
  const mark = (Icon: typeof Buildings) => <Icon size={16} />;
  const repeated = nationHeaderStatsEnabled() ? new Set(['Capital', 'Currency']) : null;
  const stats = (nationFactRowsEnabled()
    ? [{ label: 'Capital', value: nation.capital, icon: mark(Buildings) }, { label: 'Government', value: nation.government, icon: mark(Bank) }, { label: 'Economy', value: nation.economy, icon: mark(ChartLineUp) }, { label: 'Currency', value: currency, icon: mark(Coins) }]
    : [{ label: 'Capital', value: nation.capital }, { label: 'Currency', value: currency }]).filter(stat => !repeated?.has(stat.label));
  return <>
    <PanelV2 title={nation.name} subtitle={nation.motto} rowsLabel="Institution systems"
      stats={stats}
      rows={systems.map(item => ({ id: item.id, label: item.label, detail: item.title, pressed: item.id === systemId, onSelect: () => setSystemId(item.id) }))}
      primary={{ label: explore.label, ariaLabel: explore.ariaLabel, onSelect: onNationMap }} />
    <NationInstitutions {...props} systemId={systemId} systemPicker={false} />
  </>;
}
