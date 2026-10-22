'use client';
import type { ReactNode } from 'react';
import { PanelV2 } from './panel-v2';
import { uiV2PanelEnabled } from '@/lib/ui-v2-panel';
import type { CityDestination } from '@/lib/city-destinations';

/** #392 S3: the World and City side-panel pieces that change with NEXT_PUBLIC_HARIMU_UI_V2_PANEL. Each piece reads the build-time flag itself, so
 *  page.tsx never decides it (tests/ui-v2-panel.test.mjs renders these flag off and on, and pins that page.tsx passes no `enabled`). Existing copy only. */
type Nation = { id: string; name: string; government: string; capital: string; currency: string; economy: string; religion: string };
type View = 'country' | 'square' | 'nation' | CityDestination['id'];

/** World, top of the panel: summary header, stats, chevron rows and the primary action (flag on); nothing (flag off). */
export function WorldSummary({ nation, population, onView, enabled = uiV2PanelEnabled() }: { nation: Nation; population: ReactNode; onView: (view: View) => void; enabled?: boolean }) {
  if (!enabled) return null;
  return <PanelV2 title={nation.name} subtitle={nation.government} rowsLabel="Game locations"
    stats={[...(population ? [{ label: 'Population', value: population }] : []), { label: 'Capital', value: nation.capital }, { label: 'Currency', value: nation.currency }]}
    rows={[{ id: 'country', label: 'Country travel', onSelect: () => onView('country') }, { id: 'square', label: 'Open City', onSelect: () => onView('square') }]}
    primary={{ label: 'Inspect national institutions', onSelect: () => onView('nation') }} />;
}

/** World facts: the full list (flag off); with the summary on, the facts it does not show (Economy, Religion), so nothing is lost. */
export function WorldFacts({ nation, population, enabled = uiV2PanelEnabled() }: { nation: Nation; population: ReactNode; enabled?: boolean }) {
  if (enabled) return <dl><dt>Economy</dt><dd>{nation.economy}</dd><dt>Religion</dt><dd>{nation.religion}</dd></dl>;
  return <dl>{population && <><dt>Population</dt>{population}</>}<dt>Capital</dt><dd>{nation.capital}</dd><dt>Government</dt><dd>{nation.government}</dd><dt>Economy</dt><dd>{nation.economy}</dd><dt>Currency</dt><dd>{nation.currency}</dd><dt>Religion</dt><dd>{nation.religion}</dd></dl>;
}

/** The World panel's own institutions button (flag off); with the summary on, its primary action replaces it. */
export function WorldInstitutionsButton({ onView, enabled = uiV2PanelEnabled() }: { onView: (view: View) => void; enabled?: boolean }) {
  return enabled ? null : <button type="button" onClick={() => onView('nation')}>Inspect national institutions</button>;
}

/** City, top of the panel (flag on): the Household destination is promoted to the primary action (as in the concept), the other destinations are the rows. */
export function CitySummary({ cityName, nation, destinations, onView, enabled = uiV2PanelEnabled() }: { cityName: string; nation: Nation; destinations: CityDestination[]; onView: (view: View) => void; enabled?: boolean }) {
  if (!enabled) return null;
  const home = destinations.find(card => card.id === 'household');
  return <PanelV2 title={cityName} subtitle={nation.name} rowsLabel="City destinations" stats={[{ label: 'Capital', value: nation.capital }, { label: 'Currency', value: nation.currency }]}
    rows={destinations.filter(card => card !== home).map(card => ({ id: card.id, label: card.label, detail: card.detail, onSelect: () => onView(card.id) }))}
    primary={home ? { label: home.label, onSelect: () => onView(home.id) } : undefined} />;
}
