'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { GlobeHemisphereWest, House, Hammer, Storefront, Bank, UsersThree, X, Coins, Lightning, Bread, Cube, BookOpen, Compass, CaretRight } from '@phosphor-icons/react';
import GameViewport from './game-viewport';
import type { SceneView } from '@/lib/scene-navigation';
import type { LocationId, ViewportSelection } from '@/lib/game-viewport';
import './game-shell.css';

type GameNation = { id: string; name: string; capital?: string; color?: string };
export type GameShellProps = {
  view: SceneView;
  nation: GameNation;
  nations: readonly GameNation[];
  capacity: number;
  walletMinor?: number;
  inventory?: { food: number; materials: number; knowledge: number };
  shiftSummary?: { title: string; endsAt?: number };
  localDemo: boolean;
  notice?: string;
  panel: ReactNode;
  contextTitle?: string;
  contextItems?: { id: string; label: string; detail: string; onSelect?: () => void }[];
  onNavigate: (view: SceneView) => void;
  onSelectNation?: (id: string) => void;
  accountControls?: ReactNode;
};
const places = [
  { id: 'world', name: 'World', icon: GlobeHemisphereWest },
  { id: 'square', name: 'Square', icon: UsersThree },
  { id: 'home', name: 'Home', icon: House },
  { id: 'workplace', name: 'Work', icon: Hammer },
  { id: 'market', name: 'Market', icon: Storefront },
  { id: 'government', name: 'Civic', icon: Bank },
] as const;
const titles: Record<SceneView, string> = { world: 'World atlas', square: 'City square', home: 'Your household', workplace: 'Workplace', market: 'Market quarter', government: 'Government district', nation: 'Nation institutions', planning: 'Citizen plans' };
function clockLabel(now: number) { return new Date(now).toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' }); }

export function GameShell({ view, nation, nations, capacity, walletMinor, inventory, shiftSummary, localDemo, notice, panel, onNavigate, onSelectNation, accountControls, contextTitle, contextItems = [] }: GameShellProps) {
  const [now, setNow] = useState(0);
  const [closedView, setClosedView] = useState<SceneView | null>(null);
  const [selection, setSelection] = useState<ViewportSelection | null>(null);
  const [dismissedNotice, setDismissedNotice] = useState<string | undefined>();
  useEffect(() => { const tick = () => setNow(Date.now()); tick(); const id = setInterval(tick, 1000); return () => clearInterval(id); }, []);
  const hasPanel = closedView !== view;
  const close = () => { setClosedView(view); setSelection(null); };
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { setClosedView(view); setSelection(null); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [view, onNavigate]);
  const navigate = (next: SceneView) => { setSelection(null); setClosedView(null); onNavigate(next); };
  const select = (next: ViewportSelection) => {
    setSelection(next);
    setClosedView(null);
    if (next.location) { setClosedView(null); onNavigate(next.location); }
    else if (next.nationId) { setClosedView(null); onSelectNation?.(next.nationId); }
  };
  const remaining = shiftSummary?.endsAt && now ? Math.max(0, Math.ceil((shiftSummary.endsAt * 1000 - now) / 60000)) : null;
  return <main className={`harimu-game game-mode-${view === 'world' ? 'world' : 'city'} nation-${nation.id}${hasPanel ? ' has-inspector' : ''}`}>
    <a className="game-skip" href="#game-location-dock">Skip to game locations</a>
    <div className="game-stage"><GameViewport mode={view === 'world' ? 'world' : 'city'} nationId={view === 'world' ? 'atlas' : nation.id} nations={nations} selectedLocation={(['square','home','workplace','market','government'].includes(view) ? view : null) as LocationId | null} onSelect={select} /></div>
    <header className="game-hud">
      <div className="game-identity"><span className="game-crest" aria-hidden="true">H</span><div><strong>HARIMU</strong><span>{nation.name}<i />{localDemo ? 'Local demo' : 'Citizen realm'}</span></div></div>
      <div className="game-resources" aria-label="Citizen resources">
        <div title="Available work capacity"><Lightning size={19} weight="fill" /><strong>{capacity}</strong><span>WC</span></div>
        <div title="Your wallet"><Coins size={19} /><strong>{walletMinor === undefined ? '—' : (walletMinor / 100).toFixed(2)}</strong><span>SPK</span></div>
        <div title="Available food"><Bread size={19} /><strong>{inventory?.food ?? '—'}</strong><span>Food</span></div>
        <div title="Available materials"><Cube size={18} /><strong>{inventory?.materials ?? '—'}</strong><span>Mat.</span></div>
        <div title="Available knowledge"><BookOpen size={18} /><strong>{inventory?.knowledge ?? '—'}</strong><span>Know.</span></div>
      </div>
      <div className="game-account"><span className="game-clock">{now ? clockLabel(now) : '--:--'} <small>UTC · REAL TIME</small></span>{accountControls}</div>
    </header>
    <div className="game-location-banner"><Compass size={18} /><div><strong>{view === 'world' ? 'The known world' : (nation.capital ?? `${nation.name} · City district`)}</strong><span>{view === 'world' ? 'Select a nation to inspect its institutions' : 'Select a building to enter · Drag to explore'}</span></div></div>
    {shiftSummary && <button type="button" className="game-shift-chip" onClick={() => navigate('workplace')}><span className="game-live-dot" /><strong>{shiftSummary.title}</strong><span>{remaining === null ? 'Active shift' : remaining === 0 ? 'Ready to claim' : `${remaining} min remaining`}</span><CaretRight /></button>}
    {notice && notice !== dismissedNotice && <div className="game-notice" role="status"><span>{notice}</span><button type="button" aria-label="Dismiss notification" onClick={() => setDismissedNotice(notice)}><X size={16} /></button></div>}
    <aside className="game-inspector" aria-label={titles[view]}><header className="game-inspector-title"><div><small>{nation.name} / CITIZEN LIFE</small><h1 id="game-panel-title" tabIndex={-1}>{titles[view]}</h1></div>{hasPanel && <button type="button" aria-label="Close location panel" onClick={close}><X size={22} /></button>}</header><div className="game-inspector-body">
      {hasPanel ? <>{selection?.kind === 'tile' && <section className="game-selection"><small>SELECTED SQUARE</small><h2>{selection.label}</h2><p>{selection.detail}</p></section>}{panel}</> : <div className="game-panel-rest"><Compass size={32} /><p>{titles[view]} details are closed. Select a building or reopen this scene’s actions.</p><button type="button" onClick={() => setClosedView(null)}>Reopen {titles[view]}</button></div>}
    </div></aside>
    <nav id="game-location-dock" className="game-dock" aria-label="Game locations">{places.map(({id,name,icon:Icon}) => <button key={id} type="button" aria-label={`Open ${name}`} aria-current={view === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={20} weight={view === id ? 'fill' : 'regular'} /><span>{name}</span>{view === id && <i />}</button>)}</nav>
    <section className="game-context-strip" aria-label={contextTitle ?? 'Scene context'}><div className="game-context-heading"><small>{titles[view]}</small><h2>{contextTitle ?? 'Scene context'}</h2><span>{localDemo ? 'Browser-local demo' : 'Citizen snapshot'}</span></div><div className="game-context-items">{contextItems.length ? contextItems.map(item => <button type="button" key={item.id} onClick={() => { setClosedView(null); item.onSelect?.(); }}><strong>{item.label}</strong><span>{item.detail}</span><CaretRight size={16} /></button>) : <p>Open this scene’s details to view your available actions and opportunities.</p>}</div></section>
    <div className="game-world-note">SQUARE DISTRICTS · CITIZEN VIEW</div>
  </main>;
}
export default GameShell;
