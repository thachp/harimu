'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { GlobeHemisphereWest, House, Hammer, Storefront, Bank, UsersThree, X, Coins, Lightning, Bread, Cube, BookOpen, Compass, CaretRight } from '@phosphor-icons/react';
import {GameSettings} from './game-settings';
import { GameTimer } from './game-timer';
import GameViewport from './game-viewport';
import type { WorldClock } from '@/lib/world-simulation';
import type { SceneView } from '@/lib/scene-navigation';
import type { LocationId, ViewportSelection } from '@/lib/game-viewport';
import './game-shell.css';
import { NationStripFilters } from './nation-strip-filters';
import { discoverNations, nationLensLabel, nationIsPreview, type NationFamily, type NationLens } from '@/lib/nation-discovery';

type GameNation = { id: string; name: string; capital?: string; color?: string };
export type GameShellProps = {
  worldClock?: WorldClock;
  nextDeadline?: {label:string;endsAt:string};
  view: SceneView;
  nation: GameNation;
  citizenNation?: GameNation;
  nations: readonly GameNation[];
  capacity: number;
  currencyCode?: 'SPK' | 'LN' | 'CRN';
  walletMinor?: number;
  /** When set, the SPK wallet value in the top bar opens the Wallet panel. */
  onOpenWallet?: () => void;
  inventory?: { food: number; materials: number; knowledge: number };
  shiftSummary?: { title: string; endsAt?: number };
  localDemo: boolean;
  guestDemo?: boolean;
  nationFocusRevision?: number;
  cameraTourNationId?: string | null;
  onUserCamera?: () => void;
  shortlistIds?: readonly string[];
  notice?: string;
  noticeKind?: 'success' | 'error';
  panel: ReactNode;
  countryMap?: ReactNode;
  currentCityName?: string;
  contextTitle?: string;
  contextItems?: { id: string; label: string; detail: string; selected?: boolean; onSelect?: () => void }[];
  onNavigate: (view: SceneView) => void;
  onSelectNation?: (id: string) => void;
  accountControls?: ReactNode;
  socialDock?: ReactNode;
};
const places = [
  { id: 'world', name: 'World', icon: GlobeHemisphereWest },
  { id: 'country', name: 'Country', icon: Compass },
  { id: 'square', name: 'City', icon: UsersThree },
  { id: 'household', name: 'Household', icon: House },
  { id: 'workplace', name: 'Work', icon: Hammer },
  { id: 'market', name: 'Market', icon: Storefront },
  { id: 'government', name: 'Civic', icon: Bank },
] as const;
const titles: Record<SceneView, string> = { world: 'World globe', country: 'Country map', square: 'City', household: 'Household', workplace: 'Workplace', market: 'Market quarter', government: 'Government district', nation: 'Nation institutions' };
function HudHelp({ label, children, help }: { label: string; children: ReactNode; help: string }) {
  const helpId = `hud-help-${label.toLowerCase().replaceAll(" ", "-")}`;
  return <details className="game-hud-help"><summary aria-describedby={helpId}>{children}</summary><div id={helpId} className="game-hud-tip">{label}: {help}</div></details>;
}

export function GameShell({ worldClock, nextDeadline, view, nation, citizenNation, nations, capacity, currencyCode = 'SPK', walletMinor, onOpenWallet, inventory, shiftSummary, localDemo, guestDemo = false, nationFocusRevision = 0, cameraTourNationId, onUserCamera, shortlistIds = [], notice, noticeKind = 'success', panel, countryMap, currentCityName, onNavigate, onSelectNation, accountControls, socialDock, contextTitle, contextItems = [] }: GameShellProps) {
  const [family, setFamily] = useState<NationFamily>('all');
  const [lens, setLens] = useState<NationLens>('power');
  const [shortlistOnly, setShortlistOnly] = useState(false);
  const familyItems = discoverNations(contextItems, family, lens);
  const visibleItems = view === 'world' ? shortlistOnly && shortlistIds.length ? familyItems.filter(item => shortlistIds.includes(item.id)) : familyItems : contextItems;
  const hiddenSelection = view === 'world' && !visibleItems.some(item => item.id === nation.id) ? nation.name : undefined;
  const [collapsed, setCollapsed] = useState(false);
  const [selection, setSelection] = useState<ViewportSelection | null>(null);
  const [dismissedNotice, setDismissedNotice] = useState<string | undefined>();
  useEffect(() => {
    if (!notice || noticeKind === 'error') return;
    const timer = setTimeout(() => setDismissedNotice(notice), 8000);
    return () => clearTimeout(timer);
  }, [notice, noticeKind]);
  const sceneTitle = view === 'world' ? nation.name : nation.id === 'korund' && view === 'market' ? 'State ration store' : nation.id === 'korund' && view === 'workplace' ? 'Assignment board' : titles[view];
  const resourceNation = citizenNation ?? nation;
  const inspecting = view === 'world' || view === 'nation' || view === 'country';
  const hasPanel = !collapsed;
  useEffect(() => { document.getElementById('game-details')?.querySelector('.game-inspector-body')?.scrollTo({top:0,left:0}); }, [view,nation.id]);
  const close = () => { setCollapsed(true); setSelection(null); requestAnimationFrame(() => document.getElementById('game-reopen')?.focus()); };
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !(event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable=false]), dialog, [role=dialog], .cl-modalContent, .cl-userButtonPopoverCard'))) { setCollapsed(true); setSelection(null); requestAnimationFrame(() => document.getElementById('game-reopen')?.focus()); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [view, onNavigate]);
  const navigate = (next: SceneView) => { setSelection(null); setCollapsed(false); onNavigate(next); };
  const select = (next: ViewportSelection) => {
    setSelection(next);
    setCollapsed(false);
    if (next.location) { setCollapsed(false); onNavigate(next.location === 'home' ? 'household' : next.location); }
    else if (next.nationId) { setCollapsed(false); onSelectNation?.(next.nationId); }
  };
  return <main className={`harimu-game game-mode-${view === 'world' ? 'world' : 'city'} nation-${nation.id}${hasPanel ? ' has-inspector' : ' inspector-collapsed'}`}>
    <a className="game-skip" href="#game-location-dock">Skip to game locations</a>
    <div className={`game-stage${view === 'country' ? ' game-country-stage' : ''}`}>{view === 'country' ? countryMap : <GameViewport mode={view === 'world' ? 'world' : 'city'} nationId={view === 'world' ? 'atlas' : nation.id} cityName={view === 'world' ? undefined : currentCityName} nations={nations} selectedNationId={nation.id} nationFocusRevision={nationFocusRevision} cameraTourNationId={cameraTourNationId} onUserCamera={onUserCamera} selectedLocation={(view === 'household' ? 'home' : ['square','workplace','market','government'].includes(view) ? view : null) as LocationId | null} onSelect={select} />}</div>
    <header className="game-hud">
      <div className="game-identity"><span className="game-crest" aria-hidden="true">H</span><div><strong>HARIMU</strong><span>{resourceNation.name}<i />{guestDemo ? 'Guest example' : localDemo ? 'Local demo' : citizenNation ? 'Your citizen' : 'Nation preview'}</span></div></div>
      <div className="game-resources" aria-label={guestDemo ? 'Guest examples' : citizenNation || localDemo ? 'Citizen resources' : 'Citizenship resources'}>
        {guestDemo ? <span>No account · sample actions only</span> : !citizenNation && !localDemo ? <HudHelp label="Resources" help="Work capacity, money, food, materials and knowledge unlock after citizenship. Exploring nations does not create a citizen."><span>Resources unlock after citizenship</span></HudHelp> : <>
        <HudHelp label="Work capacity" help="Work capacity (WC) is energy available for jobs and civic actions. Meals restore it. Jobs use real-time timers."><Lightning size={19} weight="fill" aria-hidden="true" /><strong>{capacity}</strong><span>WC</span></HudHelp>
        {onOpenWallet && currencyCode === 'SPK' ? <button type="button" className="game-wallet-button" aria-label={`Open wallet · ${walletMinor === undefined ? 'loading' : (walletMinor / 100).toFixed(2)} SPK`} aria-haspopup="dialog" onClick={onOpenWallet}><Coins size={19} aria-hidden="true" /><strong>{walletMinor === undefined ? 'Loading' : (walletMinor / 100).toFixed(2)}</strong><span>{currencyCode}</span></button>
        : <HudHelp label="Wallet" help={`Your ${currencyCode} wallet holds national money. Amounts update after completed transactions; loading means the citizen snapshot has not arrived.`}><Coins size={19} aria-hidden="true" /><strong>{walletMinor === undefined ? 'Loading' : (walletMinor / 100).toFixed(2)}</strong><span>{currencyCode}</span></HudHelp>}
        <HudHelp label="Food" help="Food in your inventory can be used for meals to restore work capacity. Loading means the citizen snapshot has not arrived."><Bread size={19} aria-hidden="true" /><strong>{inventory?.food ?? 'Loading'}</strong><span>Food</span></HudHelp>
        <HudHelp label="Materials" help="Materials are supplies held by your citizen for production. Loading means the citizen snapshot has not arrived."><Cube size={18} aria-hidden="true" /><strong>{inventory?.materials ?? 'Loading'}</strong><span>Mat.</span></HudHelp>
        <HudHelp label="Knowledge" help="Knowledge is a resource held by your citizen for learning and production. Loading means the citizen snapshot has not arrived."><BookOpen size={18} aria-hidden="true" /><strong>{inventory?.knowledge ?? 'Loading'}</strong><span>Know.</span></HudHelp></>}
      </div>
      <div className="game-account"><HudHelp label="World clock" help={guestDemo ? 'This disposable example has no world clock. Its sample actions complete immediately.' : 'Game days start at 1; simulation ticks count completed two-hour intervals from 0. Day 2 with tick 1 means the second game day and one completed tick. World days use 12× real-time compression. This preview processes simulation ticks on visits, not continuously. Work shifts always finish at their real-time deadline.'}><span className="game-clock">{guestDemo ? 'Sample' : worldClock ? `Day ${worldClock.gameDay} · 12×` : citizenNation ? 'Loading world' : 'World preview'}<small>{worldClock ? `TICK ${worldClock.latestTick} · ON VISITS` : guestDemo ? 'NO WORLD CHANGES' : citizenNation ? 'AWAITING SNAPSHOT' : '12× · ON VISITS'}</small>{nextDeadline && <span className="game-next-deadline"><GameTimer compact endsAt={nextDeadline.endsAt} label={nextDeadline.label} /></span>}</span></HudHelp><a className="game-glossary" href="https://docs.harimu.com/appendices/glossary/" target="_blank" rel="noreferrer" aria-label="Game glossary, official documentation (opens new tab)"><BookOpen size={17} aria-hidden="true" /><span>Glossary</span></a><GameSettings/><div id="game-notification-slot" />{accountControls}</div>
    </header>
    <nav className="game-location-banner game-breadcrumbs" aria-label="Current location"><button type="button" onClick={() => navigate('world')}>World</button>{view !== 'world' && <><span>›</span><button type="button" onClick={() => navigate('country')}>{nation.name}</button></>}{view === 'nation' && <><span>›</span><span>{nation.capital ?? 'Capital'}</span></>}{!['world','country','nation'].includes(view) && <><span>›</span><button type="button" onClick={() => navigate('square')}>{currentCityName ?? nation.capital ?? 'City'}</button>{view !== 'square' && <><span>›</span><span>{sceneTitle}</span></>}</>}</nav>
    {shiftSummary && <button type="button" className="game-shift-chip" onClick={() => navigate('workplace')}><span className="game-live-dot" /><strong>{shiftSummary.title}</strong>{shiftSummary.endsAt !== undefined ? <GameTimer compact endsAt={shiftSummary.endsAt * 1000} label="Shift" /> : <span>Active shift</span>}<CaretRight /></button>}
    {notice && notice !== dismissedNotice && <div className="game-notice" role={noticeKind === 'error' ? 'alert' : 'status'}><span>{notice}</span><button type="button" aria-label="Dismiss notification" onClick={() => setDismissedNotice(notice)}><X size={16} /></button></div>}
    {hasPanel ? <aside id="game-details" className="game-inspector" aria-label={sceneTitle}><header className="game-inspector-title"><div><small>{nation.name} / {inspecting ? 'NATION INSPECTION' : 'CITIZEN LIFE'}</small><h1 id="game-panel-title" tabIndex={-1}>{sceneTitle}</h1></div><button type="button" aria-label="Collapse details" aria-expanded="true" aria-controls="game-details" onClick={close}><CaretRight size={20} /></button></header><div className="game-inspector-body">
      {selection?.kind === 'tile' && <section className="game-selection"><small>SELECTED SQUARE</small><h2>{selection.label}</h2><p>{selection.detail}</p></section>}{panel}
    </div></aside> : <button id="game-reopen" className="game-reopen-panel" type="button" aria-expanded="false" aria-controls="game-details" onClick={() => { setCollapsed(false); requestAnimationFrame(() => document.getElementById('game-panel-title')?.focus()); }}><Compass size={18} /><span>Show {sceneTitle} details</span><CaretRight size={16} /></button>}
    <nav id="game-location-dock" className="game-dock" aria-label="Game locations">{places.map(({id,name,icon:Icon}) => { const label = resourceNation.id === 'korund' && id === 'market' ? 'State store' : resourceNation.id === 'korund' && id === 'workplace' ? 'Assignment' : name; return <button key={id} type="button" aria-label={`Open ${label}`} aria-current={view === id || view === 'nation' && id === 'government' ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={20} weight={view === id || view === 'nation' && id === 'government' ? 'fill' : 'regular'} /><span>{label}</span>{(view === id || view === 'nation' && id === 'government') && <i />}</button>; })}</nav>
    <section className={`game-context-strip${view === 'world' ? ' game-nation-strip' : ''}`} aria-label={contextTitle ?? 'Scene context'}>{view === 'world' && <NationStripFilters family={family} lens={lens} onFamily={value => { setFamily(value); setShortlistOnly(false); }} onLens={setLens} hiddenSelection={hiddenSelection} shortlistCount={shortlistIds.length} shortlistActive={shortlistOnly && shortlistIds.length > 0} onShortlist={() => { setFamily('all'); setShortlistOnly(value => !value); }} />}<div className="game-context-heading"><small>{sceneTitle}</small><h2>{contextTitle ?? 'Scene context'}</h2><span>{guestDemo ? 'Disposable sample' : localDemo ? 'Browser-local demo' : view === 'country' ? 'Static lore · opt-in presence' : 'Citizen snapshot'}</span></div><div className="game-context-items">{visibleItems.length ? visibleItems.map(item => <button type="button" key={item.id} aria-pressed={item.selected} onClick={() => { setCollapsed(false); item.onSelect?.(); }}><strong>{item.label}{view === 'world' && shortlistIds.includes(item.id) && <small className="nation-preview-badge">Suggested</small>}{view === 'world' && nationIsPreview(item.id) && <small className="nation-preview-badge">Preview</small>}</strong><span>{view === 'world' && lens !== 'power' ? `${nationLensLabel(item.id, lens)} · ${item.detail}` : item.detail}</span><CaretRight size={16} /></button>) : <p>{hasPanel ? 'Details are open. Available actions appear in the scene panel.' : 'Show details to view available actions in this scene.'}</p>}</div></section>
    {socialDock}
    <div className="game-world-note">CITY DISTRICTS · CITIZEN VIEW</div>
  </main>;
}
export default GameShell;
