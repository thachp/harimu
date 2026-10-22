'use client';
// #82: the Overlays toggle group next to the zoom cluster. Slice 2 draws Ownership; Resources and Unrest are still placeholders.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { nationMark } from '../lib/nation-themes';
import type { OwnershipMap } from '../lib/map-ownership';
import { MAP_OVERLAYS, UNAVAILABLE_OVERLAYS, UNREST_SCALE, LEGEND_TEXT, toggleOverlay, overlayLabel, phonePopoverPlacement, readSessionOverlays, writeSessionOverlays, type OverlayId } from '../lib/map-overlays';

/** Renders nothing unless the server sent flags.mapOverlays === true. */
export function MapOverlaysControl({ enabled, lowGraphics = false }: { enabled: boolean; lowGraphics?: boolean }) {
  return enabled ? <MapOverlays lowGraphics={lowGraphics} /> : null;
}
const session = () => { try { return window.sessionStorage; } catch { return undefined; } };

export function MapOverlays({ lowGraphics = false }: { lowGraphics?: boolean }) {
  const [active, setActive] = useState<OverlayId[]>(() => readSessionOverlays(session())); // ARC: remembered for the browser session, off in a new one
  const [ownership, setOwnership] = useState<OwnershipMap | null>(null);
  const [open, setOpen] = useState(false); // the phone popover (390px and below)
  const [placement, setPlacement] = useState<CSSProperties>({});
  const [announcement, setAnnouncement] = useState('');
  const rootRef = useRef<HTMLDivElement>(null), triggerRef = useRef<HTMLButtonElement>(null);
  const close = () => { setOpen(false); triggerRef.current?.focus(); };
  const toggle = (id: OverlayId) => {
    const next = toggleOverlay(active, id);
    setActive(next); writeSessionOverlays(session(), next);
    setAnnouncement(next.length ? `Overlays on: ${next.map(overlayLabel).join(', ')}` : 'All overlays off');
  };
  // UX: the phone popover never overlaps the top-left "World" chip. Right-anchored beside it when it fits, else a bottom sheet below it.
  useLayoutEffect(() => {
    const root = rootRef.current, bar = root?.closest('.viewport-controls');
    if (!open || !root || !bar || getComputedStyle(triggerRef.current!).display === 'none') { setPlacement({}); return; }
    const chip = (root.closest('.harimu-game') ?? document).querySelector('.game-breadcrumbs')?.getBoundingClientRect();
    setPlacement(phonePopoverPlacement({ width: document.documentElement.clientWidth, height: window.innerHeight }, bar.getBoundingClientRect(), chip ? { right: chip.right, bottom: chip.bottom } : null));
  }, [open, active.length]);
  const ownershipOn = active.includes('ownership');
  useEffect(() => { // the only ownership read: while the overlay is on, once per mount; nothing is fetched while it is off (or the flag is off)
    if (!ownershipOn || ownership) return;
    let live = true;
    fetch('/api/world/ownership').then(r => (r.ok ? r.json() : null) as Promise<OwnershipMap | null>).then(data => { if (live && data?.cells) setOwnership(data); }).catch(() => {});
    return () => { live = false; };
  }, [ownershipOn, ownership]);
  const [viewport, setViewport] = useState<Element | null>(null); // the layer's portal target, found after mount
  useEffect(() => { setViewport(rootRef.current?.closest('.game-viewport') ?? null); }, []);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) close(); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return <div ref={rootRef} className="map-overlays" data-open={open ? 'true' : 'false'} onKeyDown={event => { if (event.key === 'Escape' && open) { event.stopPropagation(); close(); } }}>
    <button ref={triggerRef} type="button" className="map-overlays-trigger" aria-expanded={open} aria-controls="map-overlays-panel" onClick={() => setOpen(value => !value)}>Overlays</button>
    <div id="map-overlays-panel" className="map-overlays-panel" data-sheet={placement.position === 'fixed' ? 'true' : undefined} style={placement}>
      {active.length > 0 && <div className="map-overlays-legend" role="region" tabIndex={0} aria-label="Overlay legend">
        {active.map(id => <section key={id}>
          <strong>{overlayLabel(id)}</strong>
          {id === 'unrest' ? <ol className="map-overlays-scale">{UNREST_SCALE.map(step => <li key={step}>{step}</li>)}</ol> : null}
          {id === 'ownership' && ownership ? <ul className="map-ownership-key">{ownership.totals.map(({ nationId, squares }) => { const mark = nationMark(nationId); return <li key={nationId}><span aria-hidden="true" style={{ color: mark?.accent }}>{mark?.symbol ?? '■'}</span> {mark?.name ?? nationId}: {squares} squares</li>; })}</ul>
            : <span>{id === 'ownership' ? 'Loading owners.' : LEGEND_TEXT[id]}</span>}
        </section>)}
      </div>}
      <div role="group" aria-label="Overlays" className="map-overlays-group">
        <span className="map-overlays-title" aria-hidden="true">Overlays</span>
        {MAP_OVERLAYS.map(({ id, label }) => <button key={id} type="button" aria-pressed={active.includes(id)} onClick={() => toggle(id)}>{label}</button>)}
        {UNAVAILABLE_OVERLAYS.map(({ id, label, reason }) => <span key={id} className="map-overlays-unavailable">
          <button type="button" aria-disabled="true" aria-describedby={`map-overlay-${id}-reason`} onClick={event => event.preventDefault()}>{label}</button>
          <span role="tooltip" id={`map-overlay-${id}-reason`}>{reason}</span>
        </span>)}
      </div>
    </div>
    <span className="map-overlays-status" aria-live="polite">{announcement}</span>
    {ownershipOn && ownership && viewport ? createPortal(<OwnershipLayer map={ownership} lowGraphics={lowGraphics} />, viewport) : null}
  </div>;
}

/** The owned squares as a grid over the map: each nation's symbol (not color alone), tinted with its accent unless graphics are low. Decorative; the legend carries the text. */
function OwnershipLayer({ map, lowGraphics }: { map: OwnershipMap; lowGraphics: boolean }) {
  return <div className="map-ownership" data-low-graphics={lowGraphics ? 'true' : undefined} aria-hidden="true" style={{ gridTemplateColumns: `repeat(${map.width}, 1fr)`, gridTemplateRows: `repeat(${map.height}, 1fr)` }}>
    {map.cells.map(([x, y, nationId]) => { const mark = nationMark(nationId); return <span key={`${x},${y}`} data-nation={nationId} style={{ gridColumn: x + 1, gridRow: y + 1, color: mark?.accent, ...(lowGraphics ? {} : { backgroundColor: `${mark?.accent ?? '#888888'}55` }) }}>{mark?.symbol ?? '■'}</span>; })}
  </div>;
}
