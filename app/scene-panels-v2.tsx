'use client';
import type { ReactNode } from 'react';
import { Buildings, Coins, UsersThree } from '@phosphor-icons/react';
import { PanelV2 } from './panel-v2';
import { AiBadge } from './ai-disclosure';
import { cityStatusStat, uiV2PanelEnabled } from '@/lib/ui-v2-panel';
import { countryWord } from '@/lib/ui-v2-rail';
import type { CityDestination } from '@/lib/city-destinations';
import { itemCount, uiV2HouseholdEnabled } from '@/lib/ui-v2-household';
import { uiV2CityEnabled } from '@/lib/ui-v2-city';
import { cityPlaceRowsEnabled, cityPlaces } from '@/lib/city-places';
import { cityHeaderStats, cityHeaderStatsEnabled } from '@/lib/city-header-stats';
import { cityIdentityEnabled, cityIdentityKicker, cityIdentitySubtitle, cityIdentityTagline } from '@/lib/city-identity';
import { cityOpenHouseholdEnabled, cityOpenHouseholdLabel } from '@/lib/city-open-household';
import { cityTaglineBesideEnabled } from '@/lib/city-tagline-beside';
import { cityHouseholdAccessibleNameEnabled, cityHouseholdAriaLabel } from '@/lib/city-household-accessible-name';
import { cityIconSizeSyncEnabled } from '@/lib/city-icon-size-sync';
import { cityHeaderWordWrapEnabled } from '@/lib/city-header-word-wrap';
import { cityHeaderHyphenKeepEnabled } from '@/lib/city-header-hyphen-keep';
import { cityCapitalRowDedupeEnabled } from '@/lib/city-capital-row-dedupe';
import { cityPlaceIcon } from './city-pill';
import { captureHistoryLine, treatyReturnLine, type CityCaptureHistory } from '@/lib/city-capture-history'; // #1028, #1078
import { worldExploreEnabled } from '@/lib/world-atlas'; // #392 Explore card is the gold CTA

/** #392 S3: the World and City side-panel pieces that change with NEXT_PUBLIC_HARIMU_UI_V2_PANEL. Each piece reads the build-time flag itself, so
 *  page.tsx never decides it (tests/ui-v2-panel.test.mjs renders these flag off and on, and pins that page.tsx passes no `enabled`). Existing copy only. */
type Nation = { id: string; name: string; shortName?: string; government: string; capital: string; currency: string; economy: string; religion: string; population?: string | number | null };
type View = 'country' | 'square' | 'nation' | CityDestination['id'];

/** World, top of the panel: summary header, stats, chevron rows and the primary action (flag on); nothing (flag off).
 *  NEXT_PUBLIC_HARIMU_WORLD_EXPLORE demotes that primary to a secondary button so the atlas Explore action is the only gold CTA. */
export function WorldSummary({ nation, population, onView, enabled = uiV2PanelEnabled(), explore = worldExploreEnabled() }: { nation: Nation; population: ReactNode; onView: (view: View) => void; enabled?: boolean; explore?: boolean }) {
  if (!enabled) return null;
  return <PanelV2 title={nation.name} subtitle={nation.government} rowsLabel="Game locations"
    stats={[...(population ? [{ label: 'Population', value: population }] : []), { label: 'Capital', value: nation.capital }, { label: 'Currency', value: nation.currency }]}
    rows={[{ id: 'country', label: `${countryWord()} travel`, onSelect: () => onView('country') }, { id: 'square', label: 'Open City', onSelect: () => onView('square') }]}
    primary={{ label: 'Inspect national institutions', onSelect: () => onView('nation'), ...(explore ? { tone: 'secondary' as const } : {}) }} />;
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

/** City, top of the panel (flag on): "Status: Capital" first on a capital only (from the city catalog), the Household destination is promoted to the primary action (as in the concept), the other destinations are the rows.
 *  NEXT_PUBLIC_HARIMU_CITY_PLACE_ROWS: those rows become the map's five places, in pill order, with the pill icons. The Household primary stays (same destination card). Flag off keeps the rows above.
 *  NEXT_PUBLIC_HARIMU_CITY_HEADER_STATS: nation population, Status and Currency chips under the city name. The fact row then keeps Capital and drops the repeated Status and Currency. Flag off keeps today's header and fact row.
 *  NEXT_PUBLIC_HARIMU_CITY_IDENTITY: a capital's subtitle is "Capital of {nation}"; the city's description is the gold tagline; "City life" sits above the household primary. Flag off keeps today's head.
 *  NEXT_PUBLIC_HARIMU_CITY_OPEN_HOUSEHOLD: that primary reads "Open household" when the card label is exactly "Household". Any other label, no card, or the flag off keeps today's primary.
 *  NEXT_PUBLIC_HARIMU_CITY_TAGLINE_BESIDE: the city's description sits to the right of the title. A blank description stays hidden. Flag off keeps today's head, including the tagline under the title when CITY_IDENTITY is on.
 *  NEXT_PUBLIC_HARIMU_CITY_HOUSEHOLD_ACCESSIBLE_NAME: the household primary's accessible name is "{visible label}: {detail}" for citizens and visitors when the detail is non-blank. A blank detail sets no aria-label. Flag off keeps today's name.
 *  NEXT_PUBLIC_HARIMU_CITY_ICON_SIZE_SYNC: header stat marks, place marks, and row and primary carets use size 1em so text size scales them. Flag off keeps size 16 and 18.
 *  NEXT_PUBLIC_HARIMU_CITY_HEADER_WORD_WRAP: City header stat labels, values and details keep each word whole, and each chip stays inside the panel. Flag off keeps today's header.
 *  NEXT_PUBLIC_HARIMU_CITY_CAPITAL_ROW_DEDUPE: with header stats on and cityStatusStat Capital, the Capital fact is left out. Flag off, header stats off, or any other city keeps that fact.
 *  NEXT_PUBLIC_HARIMU_CITY_HEADER_HYPHEN_KEEP: a City header chip detail stays on one line, so a hard hyphen stays with its token. Flag off keeps today's header. */
export type CityTierUnlockView = { tierName: string; districtSlots: number; unlocks: readonly string[] }; // #979
export function CitySummary({ cityName, city, nation, destinations, onView, tierUnlocks, festivalNote, populationNote, specialtyRole, specialtyNote, captureNote, captureHistory, civicUnitNote, governorNote, governorAi = false, spaWcNote, hearthNightNote, hearthNightNextAt, grandRegattaNote, grandRegattaNextAt, festivalHostNote, festivalHostNextAt, visitor = false, enabled = uiV2PanelEnabled(), icons = uiV2CityEnabled(), places = cityPlaceRowsEnabled(), identity = cityIdentityEnabled(), openHousehold = cityOpenHouseholdEnabled(), taglineBeside = cityTaglineBesideEnabled(), householdName = cityHouseholdAccessibleNameEnabled(), cityIconSizeSync = cityIconSizeSyncEnabled(), cityHeaderWordWrap = cityHeaderWordWrapEnabled(), cityCapitalRowDedupe = cityCapitalRowDedupeEnabled(), cityHeaderHyphenKeep = cityHeaderHyphenKeepEnabled() }: { cityName: string; city?: { capital?: boolean; description?: string | null } | null; nation: Nation; destinations: CityDestination[]; onView: (view: View) => void; tierUnlocks?: CityTierUnlockView | null; festivalNote?: string | null; populationNote?: string | null; specialtyRole?: string | null; specialtyNote?: string | null; captureNote?: string | null; captureHistory?: CityCaptureHistory | null; civicUnitNote?: string | null; governorNote?: string | null; governorAi?: boolean; spaWcNote?: string | null; hearthNightNote?: string | null; hearthNightNextAt?: number | null; grandRegattaNote?: string | null; grandRegattaNextAt?: number | null; festivalHostNote?: string | null; festivalHostNextAt?: number | null; visitor?: boolean; enabled?: boolean; icons?: boolean; places?: boolean; identity?: boolean; openHousehold?: boolean; taglineBeside?: boolean; householdName?: boolean; cityIconSizeSync?: boolean; cityHeaderWordWrap?: boolean; cityCapitalRowDedupe?: boolean; cityHeaderHyphenKeep?: boolean }) {
  if (!enabled) return null;
  const home = destinations.find(card => card.id === 'household');
  const aligned = places ? cityPlaces(nation.id, cityName.trim() || nation.capital, destinations.some(card => card.id === 'market'), visitor) : null;
  // #392: the gold primary stays with the place rows. It is the destination card (no card: no primary, including a player with no household). Same view as the household row.
  // A visitor's row is also "Household"; the card's existing detail then keeps the two names apart. No new copy.
  const householdPlace = aligned?.find(place => place.view === 'household');
  // #392 UI 47: only the exact card label "Household" is rewritten. The trailing caret is the one PanelV2 already paints on every primary, the same CaretRight as the rows.
  const placeIcon = (id: Parameters<typeof cityPlaceIcon>[0]) => cityIconSizeSync ? cityPlaceIcon(id, '1em') : cityPlaceIcon(id);
  const homeLabel = home ? cityOpenHouseholdLabel(home.label, openHousehold) : '';
  // #392 UI 49: the visible label stays the start of the accessible name. Flag off keeps the place-row match, including its exact detail text.
  const legacyAria = home && householdPlace?.label === home.label ? `${homeLabel}: ${home.detail}` : undefined;
  const ariaLabel = home ? cityHouseholdAriaLabel(homeLabel, home.detail, householdName, legacyAria) : undefined;
  const primary = home ? { label: homeLabel, icon: icons ? placeIcon(home.id) : undefined, onSelect: () => onView(home.id), ...(ariaLabel !== undefined ? { ariaLabel } : {}) } : undefined;
  const tierStats = tierUnlocks ? [{ label: 'Tier', value: tierUnlocks.tierName }, { label: 'Districts', value: String(tierUnlocks.districtSlots) }, { label: 'Unlocks', value: tierUnlocks.unlocks.join(', ') }] : [];
  const populationStats = populationNote ? [{ label: 'Population', value: populationNote }] : []; // #1014 read-only note
  const festivalStats = festivalNote ? [{ label: 'Festivals', value: festivalNote }] : []; // #984 read-only note
  const specialtyStats = specialtyRole ? [{ label: 'Specialty', value: specialtyNote ? `${specialtyRole}. ${specialtyNote}` : specialtyRole }] : []; // #996
  const regattaStats = grandRegattaNote ? [{ label: grandRegattaNote, value: grandRegattaNextAt == null ? '' : new Date(grandRegattaNextAt).toISOString() }] : []; // #1259 read-only. [ASSUMPTION] the date is the ISO-8601 form of the #1178 nextAt. Absent unless the API sends it.
  const hearthStats = hearthNightNote ? [{ label: hearthNightNote, value: hearthNightNextAt == null ? '' : new Date(hearthNightNextAt).toISOString() }] : []; // #1242 read-only. [ASSUMPTION] the date is the ISO-8601 form of the #1146 nextAt. Absent unless the API sends it.
  const festivalHostStats = festivalHostNote ? [{ label: festivalHostNote, value: festivalHostNextAt == null ? '' : new Date(festivalHostNextAt).toISOString() }] : []; // #1285 read-only. [ASSUMPTION] the date is the ISO-8601 form of that festival's government-read nextAt. Absent unless the API sends it.
  const captureStats = captureNote ? [{ label: 'Capture', value: captureNote }] : []; // #1002 read-only note
  const historyStats = captureHistory ? [{ label: 'History', value: captureHistory.treatyReturn ? <>{captureHistoryLine(captureHistory)}<br />{treatyReturnLine(captureHistory.treatyReturn)}</> : captureHistoryLine(captureHistory) }] : []; // #1028 capture, #1078 return after it
  const civicUnitStats = civicUnitNote ? [{ label: 'Civic unit', value: civicUnitNote }] : []; // #1006 read-only note
  const governorStats = governorNote ? [{ label: 'Governor', value: governorAi ? <>{governorNote} <AiBadge /></> : governorNote }] : []; // #1007 read-only
  const headerOn = cityHeaderStatsEnabled();
  const statSize = cityIconSizeSync ? '1em' as const : 16;
  const headerStats = headerOn ? cityHeaderStats({ city, nationName: nation.shortName || nation.name, population: nation.population, currency: nation.currency }).map(stat => ({ ...stat, icon: stat.id === 'population' ? <UsersThree size={statSize} /> : stat.id === 'status' ? <Buildings size={statSize} /> : <Coins size={statSize} /> })) : undefined;
  // #392 UI 44. The buildings mark is the concept's city glyph, not a crest. The inspector header already shows the nation crest above this panel.
  const subtitle = identity ? cityIdentitySubtitle(city, nation) : nation.name;
  const tagline = identity ? cityIdentityTagline(city?.description) : null;
  const panel = <PanelV2 title={cityName} subtitle={subtitle} mark={identity ? <Buildings size={44} /> : undefined} tagline={tagline} taglineBeside={taglineBeside} primaryKicker={identity ? cityIdentityKicker(Boolean(primary)) : null} rowsLabel="City destinations" headerStats={headerStats} stats={[...[cityStatusStat(city)].filter(stat => stat !== null).filter(() => !headerOn), ...tierStats, ...populationStats, ...festivalStats, ...specialtyStats, ...hearthStats, ...regattaStats, ...festivalHostStats, ...captureStats, ...historyStats, ...civicUnitStats, ...governorStats, ...(headerOn && cityCapitalRowDedupe && cityStatusStat(city) ? [] : [{ label: 'Capital', value: nation.capital }]), ...(headerOn ? [] : [{ label: 'Currency', value: nation.currency }])]}
    rows={aligned ? aligned.map(place => ({ id: place.id, label: place.label, detail: place.detail, icon: placeIcon(place.id), onSelect: () => onView(place.view) })) : destinations.filter(card => card !== home).map(card => ({ id: card.id, label: card.label, detail: card.detail, icon: icons ? placeIcon(card.id) : undefined, onSelect: () => onView(card.id) }))}
    primary={primary} cityIconSizeSync={cityIconSizeSync} cityHeaderWordWrap={cityHeaderWordWrap} cityHeaderHyphenKeep={cityHeaderHyphenKeep} />; // S7 follow-up: with the City pills on, rows carry the pill's icon. #392 place rows: the five pills, same order and icons, then the Household primary.
  return spaWcNote ? <>{panel}<p>{spaWcNote}</p></> : panel; // #798: absent unless the API sends it
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
// #894 (QA2): the target heading (or the section itself) takes programmatic focus (tabIndex -1), so tapping a row moves focus there, not just the scroll.
const jump = (selector: string) => () => { const el = document.querySelector<HTMLElement>(selector); if (!el) return; el.scrollIntoView({ block: 'start' }); const target = el.querySelector<HTMLElement>('h2, h3') ?? el; target.tabIndex = -1; target.focus({ preventScroll: true }); };
export function WorkSummary({ capacity, contributions, onMarket, enabled = uiV2PanelEnabled() }: { capacity: number; contributions: number; onMarket?: () => void; enabled?: boolean }) {
  if (!enabled) return null;
  return <PanelV2 title="Workplace" subtitle="Contributions and earnings" rowsLabel="Workplace" stats={[{ label: 'WC', value: `${capacity} / 24` }, { label: 'Available contributions', value: String(contributions) }]}
    rows={[{ id: 'shifts', label: 'Your work shifts', icon: cityPlaceIcon('workplace'), onSelect: jump('#citizen-work-shifts') }, { id: 'orders', label: 'Available contributions', onSelect: jump('.scene-work-orders') }]}
    primary={onMarket ? { label: 'Take your earnings to market', icon: cityPlaceIcon('market'), onSelect: onMarket } : undefined} />;
}
export function MarketSummary({ nation, walletMinor, food, board, listings, onHousehold, importsNote, seaLanesNote, enabled = uiV2PanelEnabled() }: { nation: Pick<Nation, 'id' | 'name' | 'currency'>; walletMinor?: number | null; food?: number | null; board: boolean; listings: boolean; onHousehold: () => void; importsNote?: string | null; seaLanesNote?: string | null; enabled?: boolean }) {
  if (!enabled) return null;
  return <PanelV2 title="Market" subtitle="Goods and citizen listings" rowsLabel="Market"
    stats={[...(walletMinor == null ? [] : [{ label: 'Wallet', value: `${(walletMinor / 100).toFixed(2)} ${nation.currency}` }]), ...(food == null ? [] : [{ label: 'Food', value: String(food) }]), ...(importsNote ? [{ label: 'Imports', value: importsNote }] : []), ...(seaLanesNote ? [{ label: 'Sea lanes', value: seaLanesNote }] : [])]} // #1001 read-only
    rows={[...(nation.id === 'kindle' ? [{ id: 'starter', label: 'Kindle starter market', icon: cityPlaceIcon('market'), onSelect: jump('.citizen-market:not(.player-market)') }] : []), // #894 (QA2): the Kindle-named row only for Kindle
      ...(board ? [{ id: 'board', label: 'City market board', onSelect: jump('.market-board') }] : []), ...(listings ? [{ id: 'listings', label: 'Kindle citizen listings', onSelect: jump('.player-market') }] : [])]}
    primary={{ label: 'Return to household', icon: cityPlaceIcon('household'), onSelect: onHousehold }} />;
}
/** #871 (#392 S11, NEXT_PUBLIC_HARIMU_UI_V2_PANEL): the Government (Civic) panel head, in the S3 shape. Existing copy and data only: the title, subtitle
 *  and first row are the City destination card's; the lever rows are the headings of the civic sections this nation already shows, and each jumps there
 *  (nothing is removed or moved). Levers a nation lacks are not shown. The primary is the open Kindle ballot when it is shown, else the petition section. */
export function GovernmentSummary({ nation, account, enabled = uiV2PanelEnabled() }: { nation: Pick<Nation, 'id' | 'name' | 'government' | 'capital'>; account: boolean; enabled?: boolean }) {
  if (!enabled) return null;
  const ballot = nation.id === 'kindle' && account;
  const voice = { id: 'voice', label: 'Policy and petitions', icon: cityPlaceIcon('government'), onSelect: jump('[aria-label="Government preview status"]') };
  return <PanelV2 title="Government" subtitle={nation.name} rowsLabel="Government" stats={[{ label: 'Government', value: nation.government }, { label: 'Capital', value: nation.capital }]}
    rows={[...(ballot ? [voice] : []), ...(nation.id === 'kindle' && account ? [{ id: 'petitions', label: 'Collective petitions', onSelect: jump('.collective-petitions') }] : []),
      ...(nation.id === 'aurelle' && account ? [{ id: 'claimants', label: 'Claimants of the rival houses', onSelect: jump('[aria-label="Aurelle claimants and the Rising"]') }] : [])]}
    primary={ballot ? { label: 'Presidential election · PoC', onSelect: jump('.ranked-ballot') } : voice} />;
}
