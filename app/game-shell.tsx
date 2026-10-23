'use client';

import { scopeNotice, type NoticeScope } from '@/lib/notice-scope';
import { useEffect, useState, type FocusEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { nationMark, nationSymbolsEnabled, nationTheme } from '@/lib/nation-themes';
import { nationSkin } from '@/lib/nation-skin';
import { identityStatus, nationEmblem, topBarEmblemEnabled, uiV2TopbarEnabled } from '@/lib/nation-emblem';
import { helpClosed, helpIdOf, reduceHelp, type HelpEvent } from '@/lib/hud-help';
import { GlobeHemisphereWest, House, Hammer, Storefront, Bank, UsersThree, X, Coins, Lightning, Bread, Cube, BookOpen, Compass, CaretRight } from '@phosphor-icons/react';
import {GameSettings} from './game-settings';
import { GameTimer } from './game-timer';
import GameViewport from './game-viewport';
import type { WorldClock } from '@/lib/world-simulation';
import type { SceneView } from '@/lib/scene-navigation';
import type { LocationId, ViewportSelection } from '@/lib/game-viewport';
import './game-shell.css';
import { NationCrest } from './nation-crest';
import { NationSymbol } from './nation-symbol';
import { nationIsPreview } from '@/lib/nation-discovery';
import { locationVisible, marketVisible } from '@/lib/market-visibility';
import { uiV2WorldEnabled } from '@/lib/ui-v2-world';
import { countryWord, railCurrent, railKeyTarget, railLevels, uiV2RailEnabled } from '@/lib/ui-v2-rail';
import { cityStripHidden } from '@/lib/ui-v2-city';
import { uiV2MobileEnabled } from '@/lib/ui-v2-mobile';
import { contextStripStatus } from '@/lib/context-strip-copy'; // #379: a visitor's strip says "Visitor preview", not "Citizen snapshot"

type GameNation = { id: string; name: string; capital?: string; color?: string };
export type GameShellProps = {
  /** #872: nations opened in this environment by a per-nation flag (GET /api/citizen, only when nationPlayable opens one for this account); absent = the hardcoded live list. */
  openNations?: readonly string[];
  worldClock?: WorldClock;
  /** #280: name of today's public holiday (endorsed festival), when faith is on. */
  holidayName?: string | null;
  nextDeadline?: {label:string;endsAt:string;expiredText?:string};
  view: SceneView;
  nation: GameNation;
  citizenNation?: GameNation;
  /** #455/#533: the top bar while the citizen row loads: `loading` says so, `neutral` shows no nation or status, `none` is the normal line. */
  identityHold?: 'none' | 'neutral' | 'loading';
  /** #533: hold the viewed-nation labels (breadcrumb nation and city, inspector label) too: the URL names no nation of its own. */
  viewedNationHeld?: boolean;
  /** #379: isVisitorSession(): no citizen and the session is not loading or in error. False by default (citizen wording). */
  visitorSession?: boolean;
  nations: readonly GameNation[];
  capacity: number;
  currencyCode?: 'SPK' | 'LN' | 'CRN';
  walletMinor?: number;
  /** When set, the SPK wallet value in the top bar opens the Wallet panel. */
  onOpenWallet?: () => void;
  inventory?: { food: number; materials: number; knowledge: number };
  shiftSummary?: { title: string; endsAt?: number; expiredText?: string };
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
  contextItems?: { id: string; label: string; detail: string; badge?: string; selected?: boolean; onSelect?: () => void }[];
  onNavigate: (view: SceneView) => void;
  /** #344: server market flag (HARIMU_ORDER_BOOK_ENABLED). False hides the Market tab and map building; defaults to true so other callers are unchanged. */
  marketOpen?: boolean;
  /** #82: flags.mapOverlays from GET /api/citizen. */
  mapOverlays?: boolean;
  /** #738 slice 4: flags.armyMap; the Army positions overlay is available only while true. */
  armyMap?: boolean;
  onSelectNation?: (id: string) => void;
  accountControls?: ReactNode;
  socialDock?: ReactNode;
};
const worldTabFormId = 'world-tab-form';
const railIcons = { world: GlobeHemisphereWest, country: Compass, square: UsersThree } as const; // #392 S4: the same icons the zoom tabs use today
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
/** #78: the nation's emblem next to its name in the top bar (decorative glyph with an accessible name, e.g. "Kindle Republic emblem"). */
function NationEmblemMark({ id, name }: { id: string; name: string }) {
  const emblem = nationEmblem(nationTheme(id) ?? (nationSymbolsEnabled() ? nationMark(id) : null), name);
  // #78: nations with an S1 crest show it as the emblem (an SVG, so it never depends on which fonts have the glyph); the symbol glyph is the fallback, hidden by CSS when a crest rendered.
  return <span className="nation-emblem" role="img" aria-label={emblem.label} data-fallback={emblem.fallback || undefined} style={emblem.accent ? { color: emblem.accent, borderColor: emblem.accent } : undefined}><NationCrest id={id} size={20} force /><span className="nation-emblem-glyph" aria-hidden="true">{emblem.symbol}</span></span>;
}
/** Escape presses already used to dismiss a HUD tooltip, so the same press doesn't also collapse the details panel. */
const helpEscapes = new WeakSet<Event>();
/** One top-bar help item. Which one is open is owned by GameShell (lib/hud-help.ts: one at a time, hover or keyboard focus opens,
 *  leave / blur / Escape closes), so `open` is controlled and clicking never toggles it natively. */
function HudHelp({ label, children, help, open = false }: { label: string; children: ReactNode; help: string; open?: boolean }) {
  const helpId = helpIdOf(label);
  return <details className="game-hud-help" data-help-id={helpId} open={open}><summary aria-describedby={helpId}>{children}</summary><div id={helpId} className="game-hud-tip">{label}: {help}</div></details>;
}

export function GameShell({ openNations, worldClock, holidayName, nextDeadline, view, nation, citizenNation, identityHold = 'none', visitorSession = false, viewedNationHeld = false, nations, capacity, currencyCode = 'SPK', walletMinor, onOpenWallet, inventory, shiftSummary, localDemo, guestDemo = false, nationFocusRevision = 0, cameraTourNationId, onUserCamera, shortlistIds = [], notice, noticeKind = 'success', panel, countryMap, currentCityName, onNavigate, marketOpen = true, armyMap = false, mapOverlays = false, onSelectNation, accountControls, socialDock, contextTitle, contextItems = [] }: GameShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [selection, setSelection] = useState<ViewportSelection | null>(null);
  const [dismissedNotice, setDismissedNotice] = useState<string | undefined>();
  const [noticeScope, setNoticeScope] = useState<NoticeScope>({ view, notice, kind: noticeKind });
  const nextScope = scopeNotice(noticeScope, { view, notice, kind: noticeKind });
  if (nextScope !== noticeScope) { setNoticeScope(nextScope); if (nextScope.dismiss !== undefined) setDismissedNotice(nextScope.dismiss); }
  const noticeVisible = !!notice && notice !== dismissedNotice;
  useEffect(() => {
    if (!notice || noticeKind === 'error') return;
    const timer = setTimeout(() => setDismissedNotice(notice), 8000);
    return () => clearTimeout(timer);
  }, [notice, noticeKind]);
  const sceneTitle = view === 'country' ? `${countryWord()} map` : view === 'world' ? nation.name : nation.id === 'korund' && view === 'market' ? 'State ration store' : nation.id === 'aurelle' && view === 'market' ? 'Chartered food counter' : nation.id === 'korund' && view === 'workplace' ? 'Assignment board' : titles[view];
  const resourceNation = citizenNation ?? nation;
  const shownNationName = viewedNationHeld ? 'Your nation' : nation.name; // #455, #533
  const emblemOn = topBarEmblemEnabled(), topbarV2 = uiV2TopbarEnabled(); // #392 S2: topbarV2 adds the restyle (class game-hud-v2); it implies emblemOn
  const railOn = uiV2RailEnabled(); // #392 S4: zoom levels in a left rail, places in the top tabs; the rail replaces the breadcrumb
  const worldChips = view === 'world' && uiV2WorldEnabled(); // #392 S5: crest chips in the World nation strip
  const inspecting = view === 'world' || view === 'nation' || view === 'country';
  // #379: a visitor (guest, signed out, local demo, or signed in with no citizenship yet) is not a citizen. `visitorSession` comes from isVisitorSession(), which is false while the session loads or errors, so a citizen reloading a city never sees visitor wording and the scene is not rebuilt after load.
  const visitor = !citizenNation && visitorSession;
  const hasPanel = !collapsed;
  // #392 S8 follow-up (#377): on a phone the scene fills the screen between the top bar and the bottom tab bar (and citizen dock); CSS reads these heights.
  const mobileV2 = uiV2MobileEnabled();
  useEffect(() => {
    if (!mobileV2 || typeof ResizeObserver === 'undefined') return;
    const root = document.querySelector<HTMLElement>('.harimu-game.game-mobile-v2'); if (!root) return;
    const sync = () => { for (const [name, sel] of [['--s8-top', '.game-hud'], ['--s8-tabs', '.game-nav-row'], ['--s8-dock', '.citizen-dock'], ['--s8-sheet', ':is(#game-details, #game-reopen)']] as const) root.style.setProperty(name, `${root.querySelector(sel)?.getBoundingClientRect().height ?? 0}px`); };
    const observer = new ResizeObserver(sync), watched = new Set<Element>();
    const attach = () => { for (const el of root.querySelectorAll('.game-hud, .game-nav-row, .citizen-dock, #game-details, #game-reopen')) if (!watched.has(el)) { watched.add(el); observer.observe(el); } sync(); };
    // #847: the fixed phone sheet (open) or its Show-details bar (collapsed) is measured too, so the scene ends at its top.
    // Bars that mount later (the citizen dock after signing in on City) or unmount are picked up: a child-list change re-attaches and re-measures.
    const mutations = new MutationObserver(attach); mutations.observe(root, { childList: true }); attach();
    return () => { observer.disconnect(); mutations.disconnect(); };
  }, [mobileV2, view]);
  useEffect(() => { document.getElementById('game-details')?.querySelector('.game-inspector-body')?.scrollTo({top:0,left:0}); }, [view,nation.id]);
  const close = () => { setCollapsed(true); setSelection(null); requestAnimationFrame(() => document.getElementById('game-reopen')?.focus()); };
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !helpEscapes.has(event) && !(event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable=false]), dialog, [role=dialog], .cl-modalContent, .cl-userButtonPopoverCard'))) { setCollapsed(true); setSelection(null); requestAnimationFrame(() => document.getElementById('game-reopen')?.focus()); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [view, onNavigate]);
  const navigate = (next: SceneView) => { setSelection(null); setCollapsed(false); onNavigate(next); };
  const select = (next: ViewportSelection) => {
    setSelection(next);
    setCollapsed(false);
    if (next.location) { setCollapsed(false); onNavigate(next.location === 'home' ? 'household' : next.location); }
    else if (next.nationId) { setCollapsed(false); onSelectNation?.(next.nationId); }
  };
  const [help, setHelp] = useState(helpClosed);
  const dispatchHelp = (event: HelpEvent) => setHelp(current => reduceHelp(current, event));
  const isOpen = (label: string) => help.id === helpIdOf(label);
  const helpOf = (target: EventTarget) => (target as Element).closest?.('[data-help-id]')?.getAttribute('data-help-id') ?? null;
  // A tooltip left open by a tap or the keyboard closes on a press elsewhere or Escape, wherever focus is.
  useEffect(() => {
    if (!help.id) return;
    const press = (event: Event) => { if (!(event.target as Element).closest?.('.game-hud-help')) dispatchHelp({ type: 'outside' }); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { helpEscapes.add(event); dispatchHelp({ type: 'escape' }); } };
    document.addEventListener('pointerdown', press); document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('pointerdown', press); document.removeEventListener('keydown', key, true); };
  }, [help.id]);
  const hudHelpHandlers = {
    onPointerOver: (event: PointerEvent) => { if (event.pointerType === 'mouse') dispatchHelp({ type: 'pointer', id: helpOf(event.target) }); },
    onPointerLeave: (event: PointerEvent) => { if (event.pointerType === 'mouse') dispatchHelp({ type: 'pointer', id: null }); },
    onFocus: (event: FocusEvent) => { const id = helpOf(event.target); if (id) dispatchHelp({ type: 'focus', id, visible: (event.target as Element).matches(':focus-visible') }); },
    onBlur: (event: FocusEvent) => { const id = helpOf(event.target); if (id && helpOf(event.relatedTarget ?? document.body) !== id) dispatchHelp({ type: 'blur', id }); },
    onClick: (event: MouseEvent) => { const id = helpOf(event.target); if (id && (event.target as Element).closest('summary')) { event.preventDefault(); dispatchHelp({ type: 'click', id }); } },
  };
  const breadcrumbs = <nav className="game-location-banner game-breadcrumbs" aria-label="Current location"><button type="button" onClick={() => navigate('world')}>World</button>{view !== 'world' && <><span>›</span><button type="button" onClick={() => navigate('country')}>{shownNationName}</button></>}{view === 'nation' && <><span>›</span><span>{nation.capital ?? 'Capital'}</span></>}{!['world','country','nation'].includes(view) && <><span>›</span><button type="button" onClick={() => navigate('square')}>{viewedNationHeld ? 'Your city' : currentCityName ?? nation.capital ?? 'City'}</button>{view !== 'square' && <><span>›</span><span>{sceneTitle}</span></>}</>}</nav>;
  // #189: in Country the stage scrolls, so the location row and shift chip sit in its flow instead of floating over the heading and controls.
  const shiftChip = shiftSummary ? <button type="button" className="game-shift-chip" onClick={() => navigate('workplace')}><span className="game-live-dot" /><strong>{shiftSummary.title}</strong>{shiftSummary.endsAt !== undefined ? <GameTimer compact endsAt={shiftSummary.endsAt * 1000} label="Shift" expiredText={shiftSummary.expiredText} /> : <span>Active shift</span>}<CaretRight /></button> : null;
  return <main className={`harimu-game game-mode-${view === 'world' ? 'world' : 'city'} nation-${nation.id}${hasPanel ? ' has-inspector' : ' inspector-collapsed'}${railOn ? ' game-rail-on' : ''}${cityStripHidden(view) ? ' game-city-v2' : ''}${uiV2MobileEnabled() ? ' game-mobile-v2' : ''}`}>
    <a className="game-skip" href="#game-location-dock">Skip to game locations</a>
    <div className={`game-stage${view === 'country' ? ' game-country-stage' : ''}`}>{view === 'country' ? <><div className="game-country-header">{railOn ? null : breadcrumbs}{shiftChip}</div>{countryMap}</> : <GameViewport marketOpen={marketVisible(resourceNation.id, marketOpen)} visitor={visitor} overlays={mapOverlays} armyMap={armyMap} mode={view === 'world' ? 'world' : 'city'} nationId={view === 'world' ? 'atlas' : nation.id} cityName={view === 'world' ? undefined : currentCityName} nations={nations} selectedNationId={nation.id} nationFocusRevision={nationFocusRevision} cameraTourNationId={cameraTourNationId} onUserCamera={onUserCamera} selectedLocation={(view === 'household' ? 'home' : ['square','workplace','market','government'].includes(view) ? view : null) as LocationId | null} onSelect={select} />}</div>
    <header className={topbarV2 ? 'game-hud game-hud-v2' : 'game-hud'} data-nation-skin={nationSkin(citizenNation?.id) ?? undefined} {...hudHelpHandlers}>
      <div className="game-identity"><span className="game-crest" aria-hidden="true">H</span><div><strong>HARIMU</strong><span><span role="status">{identityHold === 'loading' ? 'Loading your citizen…' : null}</span>{identityHold !== 'none' ? null : <>{emblemOn && <NationEmblemMark id={resourceNation.id} name={resourceNation.name} />}{resourceNation.name}<i />{identityStatus({ guestDemo, localDemo, hasCitizenNation: Boolean(citizenNation) }, emblemOn)}</>}</span></div></div>
      <div className="game-resources" aria-label={guestDemo ? 'Guest examples' : citizenNation || localDemo ? 'Citizen resources' : 'Citizenship resources'}>
        {guestDemo ? <span>No account · sample actions only</span> : !citizenNation && !localDemo ? <HudHelp label="Resources" open={isOpen("Resources")} help="Work capacity, money, food, materials and knowledge unlock after citizenship. Exploring nations does not create a citizen."><span>Resources unlock after citizenship</span></HudHelp> : <>
        <HudHelp label="Work capacity" open={isOpen("Work capacity")} help="Work capacity (WC) is energy available for jobs and civic actions. Meals restore it. Jobs use real-time timers."><Lightning size={19} weight="fill" aria-hidden="true" /><strong>{capacity}</strong><span>WC</span></HudHelp>
        {onOpenWallet && currencyCode === 'SPK' ? <button type="button" className="game-wallet-button" aria-label={`Open wallet · ${walletMinor === undefined ? 'loading' : (walletMinor / 100).toFixed(2)} SPK`} aria-haspopup="dialog" onClick={onOpenWallet}><Coins size={19} aria-hidden="true" /><strong>{walletMinor === undefined ? 'Loading' : (walletMinor / 100).toFixed(2)}</strong><span>{currencyCode}</span></button>
        : <HudHelp label="Wallet" open={isOpen("Wallet")} help={`Your ${currencyCode} wallet holds national money. Amounts update after completed transactions; loading means the citizen snapshot has not arrived.`}><Coins size={19} aria-hidden="true" /><strong>{walletMinor === undefined ? 'Loading' : (walletMinor / 100).toFixed(2)}</strong><span>{currencyCode}</span></HudHelp>}
        <HudHelp label="Food" open={isOpen("Food")} help="Food in your inventory can be used for meals to restore work capacity. Loading means the citizen snapshot has not arrived."><Bread size={19} aria-hidden="true" /><strong>{inventory?.food ?? 'Loading'}</strong><span>Food</span></HudHelp>
        <HudHelp label="Materials" open={isOpen("Materials")} help="Materials are supplies held by your citizen for production. Loading means the citizen snapshot has not arrived."><Cube size={18} aria-hidden="true" /><strong>{inventory?.materials ?? 'Loading'}</strong><span>Mat.</span></HudHelp>
        <HudHelp label="Knowledge" open={isOpen("Knowledge")} help="Knowledge is a resource held by your citizen for learning and production. Loading means the citizen snapshot has not arrived."><BookOpen size={18} aria-hidden="true" /><strong>{inventory?.knowledge ?? 'Loading'}</strong><span>Know.</span></HudHelp></>}
      </div>
      <div className="game-account"><HudHelp label="World clock" open={isOpen("World clock")} help={guestDemo ? 'This disposable example has no world clock. Its sample actions complete immediately.' : 'Game days start at 1; simulation ticks count completed two-hour intervals from 0. Day 2 with tick 1 means the second game day and one completed tick. World days use 12× real-time compression: one real day is 12 game days. This preview processes simulation ticks on visits, not continuously. Work shifts always finish at their real-time deadline.'}><span className="game-clock">{guestDemo ? 'Sample' : worldClock ? `Day ${worldClock.gameDay} · 12×` : citizenNation ? 'Loading world' : 'World preview'}<small>{worldClock ? `TICK ${worldClock.latestTick} · ON VISITS` : guestDemo ? 'NO WORLD CHANGES' : citizenNation ? 'AWAITING SNAPSHOT' : '12× · ON VISITS'}</small>{holidayName && <small className="game-clock-holiday">Public holiday</small>}{nextDeadline && <span className="game-next-deadline"><GameTimer compact endsAt={nextDeadline.endsAt} label={nextDeadline.label} expiredText={nextDeadline.expiredText} /></span>}</span></HudHelp><a className="game-glossary" href="https://docs.harimu.com/appendices/glossary/" target="_blank" rel="noreferrer" aria-label="Game glossary, official documentation (opens new tab)"><BookOpen size={17} aria-hidden="true" /><span>Glossary</span></a><GameSettings/><div id="game-notification-slot" />{accountControls}</div>
    </header>
    {view !== 'country' && (!railOn || shiftChip) && <div className="game-stage-overlay">{railOn ? null : breadcrumbs}{shiftChip}</div>}
    {noticeVisible && <div className="game-notice" role={noticeKind === 'error' ? 'alert' : 'status'}><span>{notice}</span><button type="button" aria-label="Dismiss notification" onClick={() => setDismissedNotice(notice)}><X size={16} /></button></div>}
    {hasPanel ? <aside id="game-details" className="game-inspector" aria-label={sceneTitle}><header className="game-inspector-title">{identityHold === 'none' && !viewedNationHeld && <NationCrest id={nation.id} size={44} />}<div><small>{shownNationName} / {inspecting ? 'NATION INSPECTION' : visitor ? 'VISITOR PREVIEW' : 'CITIZEN LIFE'}</small><h1 id="game-panel-title" tabIndex={-1}>{sceneTitle}</h1></div><button type="button" aria-label="Collapse details" aria-expanded="true" aria-controls="game-details" onClick={close}><CaretRight size={20} /></button></header><div className="game-inspector-body">
      {selection?.kind === 'tile' && <section className="game-selection"><small>SELECTED SQUARE</small><h2>{selection.label}</h2><p>{selection.detail}</p></section>}{panel}
    </div></aside> : <button id="game-reopen" className="game-reopen-panel" type="button" aria-expanded="false" aria-controls="game-details" onClick={() => { setCollapsed(false); requestAnimationFrame(() => document.getElementById('game-panel-title')?.focus()); }}><Compass size={18} /><span>Show {sceneTitle} details</span><CaretRight size={16} /></button>}
    {/* #379: the World tab is a real GET submit (?view=world&nation=…) until React hydrates, so an early click loads the globe instead of being dropped; after hydration onClick takes over with no reload. */}
    <form id={worldTabFormId} method="get" hidden><input type="hidden" name="nation" value={nation.id} /></form>
    {railOn ? <div className="game-nav-row"><nav className="game-zoom-rail" aria-label="Zoom level" onKeyDown={event => { const buttons = [...event.currentTarget.querySelectorAll('button')], next = railKeyTarget(event.key, buttons.indexOf(document.activeElement as HTMLButtonElement), buttons.length); if (next !== null) { event.preventDefault(); buttons[next]?.focus(); } }}>{railLevels.map(({id,name}) => { const Icon = railIcons[id], current = railCurrent(id, view); return <button key={id} type={id === 'world' ? 'submit' : 'button'} {...(id === 'world' ? { form: worldTabFormId, name: 'view', value: 'world' } : {})} aria-current={current} onClick={event => { event.preventDefault(); navigate(id); }}><Icon size={22} weight={current ? 'fill' : 'regular'} aria-hidden="true" /><span>{name}</span></button>; })}</nav><nav id="game-location-dock" className="game-dock" aria-label="Game locations">{places.filter(({id}) => locationVisible(id, resourceNation.id, marketOpen) && !(railOn && id in railIcons)).map(({id,name,icon:Icon}) => { const label = resourceNation.id === 'korund' && id === 'market' ? 'State store' : resourceNation.id === 'aurelle' && id === 'market' ? 'Chartered food' : resourceNation.id === 'korund' && id === 'workplace' ? 'Assignment' : name; return <button key={id} type={id === 'world' ? 'submit' : 'button'} {...(id === 'world' ? { form: worldTabFormId, name: 'view', value: 'world' } : {})} aria-label={`Open ${label}`} aria-current={view === id || view === 'nation' && id === 'government' ? 'page' : undefined} onClick={event => { event.preventDefault(); navigate(id); }}><Icon size={20} weight={view === id || view === 'nation' && id === 'government' ? 'fill' : 'regular'} /><span>{label}</span>{(view === id || view === 'nation' && id === 'government') && <i />}</button>; })}</nav></div> : <nav id="game-location-dock" className="game-dock" aria-label="Game locations">{places.filter(({id}) => locationVisible(id, resourceNation.id, marketOpen)).map(({id,name,icon:Icon}) => { const label = resourceNation.id === 'korund' && id === 'market' ? 'State store' : resourceNation.id === 'aurelle' && id === 'market' ? 'Chartered food' : resourceNation.id === 'korund' && id === 'workplace' ? 'Assignment' : name; return <button key={id} type={id === 'world' ? 'submit' : 'button'} {...(id === 'world' ? { form: worldTabFormId, name: 'view', value: 'world' } : {})} aria-label={`Open ${label}`} aria-current={view === id || view === 'nation' && id === 'government' ? 'page' : undefined} onClick={event => { event.preventDefault(); navigate(id); }}><Icon size={20} weight={view === id || view === 'nation' && id === 'government' ? 'fill' : 'regular'} /><span>{label}</span>{(view === id || view === 'nation' && id === 'government') && <i />}</button>; })}</nav>}
    {!cityStripHidden(view) && <section className={`game-context-strip${view === 'world' ? ' game-nation-strip' : ''}${worldChips ? ' game-world-v2' : ''}`} aria-label={contextTitle ?? 'Scene context'}><div className="game-context-heading"><small>{sceneTitle}</small><h2>{contextTitle ?? 'Scene context'}</h2><span>{contextStripStatus({ guestDemo, localDemo, country: view === 'country', visitor })}</span></div><div className="game-context-items">{contextItems.length ? contextItems.map(item => <button type="button" key={item.id} aria-pressed={item.selected} onClick={() => { setCollapsed(false); item.onSelect?.(); }}><strong>{view === 'world' && (worldChips ? <NationCrest id={item.id} size={30} force /> : <NationSymbol id={item.id} />)}{item.label}{view === 'world' && shortlistIds.includes(item.id) && <small className="nation-preview-badge">Suggested</small>}{view === 'world' && nationIsPreview(item.id, openNations) && item.badge !== 'Coming soon' && <small className="nation-preview-badge">Preview</small>}{item.badge && <small className="population-band-badge" data-band={item.badge}>{item.badge}</small>}</strong><span>{item.detail}</span><CaretRight size={16} /></button>) : <p>{hasPanel ? 'Details are open. Available actions appear in the scene panel.' : 'Show details to view available actions in this scene.'}</p>}</div></section>}
    {socialDock}
    <div className="game-world-note">{visitor ? 'CITY DISTRICTS · VISITOR VIEW' : 'CITY DISTRICTS · CITIZEN VIEW'}</div> {/* #379 [ASSUMPTION] wording: a visitor is not a citizen */}
  </main>;
}
export default GameShell;
