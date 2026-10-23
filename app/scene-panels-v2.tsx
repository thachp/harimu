'use client';
import type { ReactNode } from 'react';
import { PanelV2 } from './panel-v2';
import { cityStatusStat, uiV2PanelEnabled } from '@/lib/ui-v2-panel';
import { countryWord } from '@/lib/ui-v2-rail';
import type { CityDestination } from '@/lib/city-destinations';
import { itemCount, uiV2HouseholdEnabled } from '@/lib/ui-v2-household';
import { uiV2CityEnabled } from '@/lib/ui-v2-city';
import { cityPlaceIcon } from './city-pill';

/** #392 S3: the World and City side-panel pieces that change with NEXT_PUBLIC_HARIMU_UI_V2_PANEL. Each piece reads the build-time flag itself, so
 *  page.tsx never decides it (tests/ui-v2-panel.test.mjs renders these flag off and on, and pins that page.tsx passes no `enabled`). Existing copy only. */
type Nation = { id: string; name: string; government: string; capital: string; currency: string; economy: string; religion: string };
type View = 'country' | 'square' | 'nation' | CityDestination['id'];

/** World, top of the panel: summary header, stats, chevron rows and the primary action (flag on); nothing (flag off). */
export function WorldSummary({ nation, population, onView, enabled = uiV2PanelEnabled() }: { nation: Nation; population: ReactNode; onView: (view: View) => void; enabled?: boolean }) {
  if (!enabled) return null;
  return <PanelV2 title={nation.name} subtitle={nation.government} rowsLabel="Game locations"
    stats={[...(population ? [{ label: 'Population', value: population }] : []), { label: 'Capital', value: nation.capital }, { label: 'Currency', value: nation.currency }]}
    rows={[{ id: 'country', label: `${countryWord()} travel`, onSelect: () => onView('country') }, { id: 'square', label: 'Open City', onSelect: () => onView('square') }]}
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

/** City, top of the panel (flag on): "Status: Capital" first on a capital only (from the city catalog), the Household destination is promoted to the primary action (as in the concept), the other destinations are the rows. */
export function CitySummary({ cityName, city, nation, destinations, onView, enabled = uiV2PanelEnabled(), icons = uiV2CityEnabled() }: { cityName: string; city?: { capital?: boolean } | null; nation: Nation; destinations: CityDestination[]; onView: (view: View) => void; enabled?: boolean; icons?: boolean }) {
  if (!enabled) return null;
  const home = destinations.find(card => card.id === 'household');
  return <PanelV2 title={cityName} subtitle={nation.name} rowsLabel="City destinations" stats={[...[cityStatusStat(city)].filter(stat => stat !== null), { label: 'Capital', value: nation.capital }, { label: 'Currency', value: nation.currency }]}
    rows={destinations.filter(card => card !== home).map(card => ({ id: card.id, label: card.label, detail: card.detail, icon: icons ? cityPlaceIcon(card.id) : undefined, onSelect: () => onView(card.id) }))}
    primary={home ? { label: home.label, icon: icons ? cityPlaceIcon(home.id) : undefined, onSelect: () => onView(home.id) } : undefined} />; // S7 follow-up: with the City pills on, rows carry the pill's icon
}

/** #392 S9 (NEXT_PUBLIC_HARIMU_UI_V2_HOUSEHOLD): the Household panel head, existing data only. Wallet, Food, Residence, and Pantry (food and materials from the
 *  inventory); family cards with the four existing Vale portraits. Names and relations are the household's own from the original planning view (137d9d4);
 *  no needs or mood are shown because no per-member data exists. The portraits are decorative (alt=""): each card's name is its text. */
// TODO(#392): the Vale family is shared across every nation; per-nation households need their own data.
export const valeFamily = [
  { id: 'citizen', name: 'You', relation: 'Citizen', image: '/assets/household/leora-vale.webp' },
  { id: 'partner', name: 'Toma Vale', relation: 'Partner', image: '/assets/household/toma-vale.webp' },
  { id: 'apprentice', name: 'Mika Vale', relation: 'Daughter', image: '/assets/household/mika-vale.webp' },
  { id: 'child', name: 'Niko Vale', relation: 'Son', image: '/assets/household/niko-vale.webp' },
] as const;
export function HouseholdSummary({ nation, walletMinor, inventory, pantry = true, residence, enabled = uiV2HouseholdEnabled() }: { nation: Pick<Nation, 'name' | 'currency'>; walletMinor?: number | null; inventory?: readonly { item: string; quantity: number }[] | null; pantry?: boolean; residence?: string | null; enabled?: boolean }) {
  if (!enabled) return null;
  // #861: Food and Pantry show only the nation's own stock (inventory missing: both hide; pantry false: no materials count, Pantry hides).
  const food = itemCount(inventory, 'food'), materials = itemCount(inventory, 'materials');
  return <div className="household-v2">
    <PanelV2 title="Household" subtitle={nation.name} rowsLabel="Household" rows={[]}
      stats={[...(walletMinor == null ? [] : [{ label: 'Wallet', value: `${(walletMinor / 100).toFixed(2)} ${nation.currency}` }]), ...(inventory ? [{ label: 'Food', value: String(food) }] : []), ...(residence ? [{ label: 'Residence', value: residence }] : []), ...(inventory && pantry ? [{ label: 'Pantry', value: `${food} food · ${materials} materials` }] : [])]} />
    <ul className="household-v2-family" aria-label="Household members">{valeFamily.map(member => <li key={member.id}>{/* eslint-disable-line @next/next/no-img-element -- 48px decorative static portraits; no Next image loader on this deploy */}<img src={member.image} alt="" width={48} height={48} loading="lazy" /><strong>{member.name}</strong><small>{member.relation}</small></li>)}</ul>
  </div>;
}

/** #392 S10 (NEXT_PUBLIC_HARIMU_UI_V2_PANEL): the Work and Market panel heads, in the S3 shape. Existing copy and data only: the titles and taglines are the City
 *  destination cards', the rows jump to the sections already below (nothing is removed or moved), and the primary is the view's existing closing action. */
const jump = (selector: string) => () => { const el = document.querySelector<HTMLElement>(selector); el?.scrollIntoView({ block: 'start' }); el?.querySelector<HTMLElement>('h2, h3')?.focus?.(); };
export function WorkSummary({ capacity, contributions, onMarket, enabled = uiV2PanelEnabled() }: { capacity: number; contributions: number; onMarket?: () => void; enabled?: boolean }) {
  if (!enabled) return null;
  return <PanelV2 title="Workplace" subtitle="Contributions and earnings" rowsLabel="Workplace" stats={[{ label: 'WC', value: `${capacity} / 24` }, { label: 'Available contributions', value: String(contributions) }]}
    rows={[{ id: 'shifts', label: 'Your work shifts', icon: cityPlaceIcon('workplace'), onSelect: jump('#citizen-work-shifts') }, { id: 'orders', label: 'Available contributions', onSelect: jump('.scene-work-orders') }]}
    primary={onMarket ? { label: 'Take your earnings to market', icon: cityPlaceIcon('market'), onSelect: onMarket } : undefined} />;
}
export function MarketSummary({ nation, walletMinor, food, board, listings, onHousehold, enabled = uiV2PanelEnabled() }: { nation: Pick<Nation, 'name' | 'currency'>; walletMinor?: number | null; food?: number | null; board: boolean; listings: boolean; onHousehold: () => void; enabled?: boolean }) {
  if (!enabled) return null;
  return <PanelV2 title="Market" subtitle="Goods and citizen listings" rowsLabel="Market"
    stats={[...(walletMinor == null ? [] : [{ label: 'Wallet', value: `${(walletMinor / 100).toFixed(2)} ${nation.currency}` }]), ...(food == null ? [] : [{ label: 'Food', value: String(food) }])]}
    rows={[{ id: 'starter', label: 'Kindle starter market', icon: cityPlaceIcon('market'), onSelect: jump('.citizen-market:not(.player-market)') },
      ...(board ? [{ id: 'board', label: 'City market board', onSelect: jump('.market-board') }] : []), ...(listings ? [{ id: 'listings', label: 'Kindle citizen listings', onSelect: jump('.player-market') }] : [])]}
    primary={{ label: 'Return to household', icon: cityPlaceIcon('household'), onSelect: onHousehold }} />;
}
