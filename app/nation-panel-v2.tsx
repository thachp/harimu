'use client';
import { useState, type ComponentProps } from 'react';
import { NationInstitutions, institutionSystems } from './nation-institutions';
import { PanelV2 } from './panel-v2';
import { exploreNationLabels, uiV2NationEnabled } from '@/lib/ui-v2-nation';

/** #392 S6: the Nation panel. Flag off: exactly the existing NationInstitutions. Flag on: the S3 panel shape on top (name, motto, Capital and Currency,
 *  the institution systems as chevron rows, "Explore {nation}" to the nation map), then the same NationInstitutions with its system picker replaced by the rows.
 *  Reads the build-time flag itself, so page.tsx never decides it. Existing lore only, plus Content's approved "Explore" copy. */
export function NationPanel({ onNationMap, enabled = uiV2NationEnabled(), ...props }: ComponentProps<typeof NationInstitutions> & { onNationMap: () => void; enabled?: boolean }) {
  const [systemId, setSystemId] = useState('capital');
  if (!enabled) return <NationInstitutions {...props} />;
  const { nation } = props, systems = institutionSystems(nation), explore = exploreNationLabels(nation.shortName);
  return <>
    <PanelV2 title={nation.name} subtitle={nation.motto} rowsLabel="Institution systems"
      stats={[{ label: 'Capital', value: nation.capital }, { label: 'Currency', value: nation.currency.split(' · ')[0] }]}
      rows={systems.map(item => ({ id: item.id, label: item.label, detail: item.title, pressed: item.id === systemId, onSelect: () => setSystemId(item.id) }))}
      primary={{ label: explore.label, ariaLabel: explore.ariaLabel, onSelect: onNationMap }} />
    <NationInstitutions {...props} systemId={systemId} systemPicker={false} />
  </>;
}
